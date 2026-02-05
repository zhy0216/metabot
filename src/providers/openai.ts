import OpenAI from "openai";
import { LLMProvider, type LLMProviderOptions } from "./base";
import type { LLMMessage, LLMResponse, ToolDefinition, ToolCall } from "../types";

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(options: LLMProviderOptions) {
    super(options);
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  getDefaultModel(): string {
    return "gpt-4o";
  }

  getName(): string {
    return "openai";
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

    // Build messages array
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system prompt
    if (options?.systemPrompt) {
      openaiMessages.push({ role: "system", content: options.systemPrompt });
    }

    // Convert messages
    openaiMessages.push(...this.convertMessages(messages));

    // Convert tools
    const tools: OpenAI.ChatCompletionTool[] | undefined = options?.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
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

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) {
      openaiMessages.push({ role: "system", content: options.systemPrompt });
    }
    openaiMessages.push(...this.convertMessages(messages));

    const tools: OpenAI.ChatCompletionTool[] | undefined = options?.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
      tools: tools?.length ? tools : undefined,
      stream: true,
    });

    let content = "";
    const toolCalls: Map<number, ToolCall> = new Map();
    let finishReason: LLMResponse["finishReason"] = "stop";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        content += delta.content;
        yield delta.content;
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCalls.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments = {
                ...existing.arguments,
                ...(tc.function.arguments ? {} : {}),
              };
              // Accumulate JSON string
              const prev = (existing as unknown as { _json: string })._json ?? "";
              (existing as unknown as { _json: string })._json = prev + tc.function.arguments;
            }
          } else {
            toolCalls.set(tc.index, {
              id: tc.id ?? `call_${tc.index}`,
              name: tc.function?.name ?? "",
              arguments: {},
              ...({ _json: tc.function?.arguments ?? "" } as unknown as object),
            } as ToolCall);
          }
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = this.mapFinishReason(chunk.choices[0].finish_reason);
      }
    }

    // Parse accumulated JSON arguments
    const finalToolCalls: ToolCall[] = [];
    for (const tc of toolCalls.values()) {
      const json = (tc as unknown as { _json?: string })._json;
      if (json) {
        try {
          tc.arguments = JSON.parse(json);
        } catch {
          tc.arguments = {};
        }
      }
      delete (tc as unknown as { _json?: string })._json;
      finalToolCalls.push(tc);
    }

    return {
      content,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      finishReason,
    };
  }

  private convertMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        result.push({ role: "system", content: m.content as string });
        continue;
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        result.push({
          role: "assistant",
          content: m.content as string || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
        continue;
      }

      if (m.toolResults && m.toolResults.length > 0) {
        for (const tr of m.toolResults) {
          result.push({
            role: "tool",
            tool_call_id: tr.callId,
            content: tr.error ?? tr.result,
          });
        }
        continue;
      }

      result.push({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      });
    }

    return result;
  }

  private parseResponse(response: OpenAI.ChatCompletion): LLMResponse {
    const choice = response.choices[0];
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || "{}"),
        });
      }
    }

    return {
      content: choice.message.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  private mapFinishReason(
    reason: string | null
  ): LLMResponse["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "tool_calls":
        return "tool_use";
      case "length":
        return "max_tokens";
      default:
        return "stop";
    }
  }
}
