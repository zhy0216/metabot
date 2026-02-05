import type { LLMMessage, LLMResponse, ToolDefinition } from "../types";

export interface LLMProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export abstract class LLMProvider {
  protected apiKey: string;
  protected baseUrl?: string;
  protected defaultModel: string;

  constructor(options: LLMProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.defaultModel = options.model ?? this.getDefaultModel();
  }

  abstract getDefaultModel(): string;
  abstract getName(): string;

  abstract chat(
    messages: LLMMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: ToolDefinition[];
      systemPrompt?: string;
    }
  ): Promise<LLMResponse>;

  // Stream variant (optional implementation)
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
    // Default implementation: non-streaming fallback
    const response = await this.chat(messages, options);
    yield response.content;
    return response;
  }
}
