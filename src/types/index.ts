// Core type definitions for the bot framework

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface InboundMessage {
  id: string;
  channel: string;
  chatId: string;
  userId: string;
  content: string;
  timestamp: Date;
  media?: MediaAttachment[];
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  id: string;
  channel: string;
  chatId: string;
  content: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface MediaAttachment {
  type: "image" | "audio" | "video" | "document";
  url?: string;
  data?: string; // base64
  mimeType: string;
  filename?: string;
}

// Tool system types
export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  result: string;
  error?: string;
}

// LLM types
export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  image?: { url: string } | { base64: string; mediaType: string };
  toolUse?: ToolCall;
  toolResult?: ToolResult;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason?: "stop" | "tool_use" | "max_tokens" | "error";
}

// Agent types
export interface AgentConfig {
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
  maxToolIterations?: number;
  systemPrompt?: string;
}

export interface SubagentTask {
  id: string;
  label: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  parentChannel: string;
  parentChatId: string;
}

// Session types
export interface Session {
  id: string;
  channel: string;
  chatId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

// Skill types
export interface SkillMetadata {
  name: string;
  description: string;
  requires?: {
    bins?: string[];
    env?: string[];
  };
  always?: boolean;
}

export interface Skill {
  name: string;
  metadata: SkillMetadata;
  content: string;
  available: boolean;
  missingRequirements?: string[];
}

// Config types
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
}

export interface ChannelConfig {
  enabled?: boolean;
  allowFrom?: string[];
  [key: string]: unknown;
}

export interface Config {
  agent: AgentConfig;
  providers: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    openrouter?: ProviderConfig;
    ollama?: ProviderConfig;
  };
  channels: {
    cli?: ChannelConfig;
    telegram?: ChannelConfig & { token?: string };
    discord?: ChannelConfig & { token?: string };
  };
  tools: {
    exec?: { timeout?: number; allowedCommands?: string[] };
    web?: { searchApiKey?: string };
  };
  workspace: string;
}
