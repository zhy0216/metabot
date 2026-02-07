export interface ChannelConfig {
  name: string;
  agentId?: string;
  agentType?: string;
  model?: string;
  workspacePath?: string;
  ownsAgent?: boolean;
}

export interface Channel {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
