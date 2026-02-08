export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentConfig {
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
  maxToolIterations?: number;
  systemPrompt?: string;
}

export interface TelegramConfig {
  botToken: string;
  allowedUsers?: number[];
}

export interface ChannelsConfig {
  telegram?: TelegramConfig;
}

export interface Config {
  agent: AgentConfig;
  workspace: string;
  channels?: ChannelsConfig;
}
