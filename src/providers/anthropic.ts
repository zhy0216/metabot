import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider, type LLMProviderOptions } from "./base";
import type { LLMMessage, LLMResponse, ToolDefinition, ToolCall } from "../types";

export class AnthropicProvider extends LLMProvider {
  private client: Anthropic;

  constructor(options: LLMProviderOptions) {
    super(options);
    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  getDefaultModel(): string {
    return "claude-sonnet-4-20250514";
  }

  getName(): string {
    return "anthropic";
  }

  async chat(
    messages: LLMMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;

    // Convert messages to Anthropic format
    const anthropicMessages = this.convertMessages(messages);

    // Convert tools to Anthropic format
    const tools = options?.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: options?.temperature,
      system: options?.systemPrompt,
      messages: anthropicMessages,
      tools: tools?.length ? tools : undefined,
    });

    return this.parseResponse(response);
  }

  async *stream(
    messages: LLMMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;

    const anthropicMessages = this.convertMessages(messages);
    const tools = options?.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    const stream = this.client.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature: options?.temperature,
      system: options?.systemPrompt,
      messages: anthropicMessages,
      tools: tools?.length ? tools : undefined,
    });

    let content = "";
    const toolCalls: ToolCall[] = [];
    let currentToolCall: Partial<ToolCall> | null = null;
    let toolInputJson = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
          };
          toolInputJson = "";
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          content += event.delta.text;
          yield event.delta.text;
        } else if (event.delta.type === "input_json_delta") {
          toolInputJson += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolCall) {
          try {
            currentToolCall.arguments = JSON.parse(toolInputJson || "{}");
          } catch {
            currentToolCall.arguments = {};
          }
          toolCalls.push(currentToolCall as ToolCall);
          currentToolCall = null;
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
      finishReason: this.mapStopReason(finalMessage.stop_reason),
    };
  }

  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.toolCalls && m.toolCalls.length > 0) {
          // Assistant message with tool calls
          const content: Anthropic.ContentBlock[] = [];
          if (m.content) {
            content.push({ type: "text", text: m.content });
          }
          for (const tc of m.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
          return { role: "assistant" as const, content };
        }

        if (m.toolResults && m.toolResults.length > 0) {
          // User message with tool results
          const content: Anthropic.ToolResultBlockParam[] = m.toolResults.map((tr) => ({
            type: "tool_result" as const,
            tool_use_id: tr.callId,
            content: tr.error ?? tr.result,
            is_error: !!tr.error,
          }));
          return { role: "user" as const, content };
        }

        // Regular text message
        return {
          role: m.role as "user" | "assistant",
          content: m.content as string,
        };
      });
  }

  private parseResponse(response: Anthropic.Message): LLMResponse {
    let content = "";
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      finishReason: this.mapStopReason(response.stop_reason),
    };
  }

  private mapStopReason(
    reason: Anthropic.Message["stop_reason"]
  ): LLMResponse["finishReason"] {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "tool_use":
        return "tool_use";
      case "max_tokens":
        return "max_tokens";
      default:
        return "stop";
    }
  }
}
