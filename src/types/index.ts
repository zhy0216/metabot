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

export interface Config {
  agent: AgentConfig;
  workspace: string;
}
