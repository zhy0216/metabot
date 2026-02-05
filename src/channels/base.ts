import type { InboundMessage, OutboundMessage, ChannelConfig } from "../types";

export abstract class BaseChannel {
  protected config: ChannelConfig;
  protected running = false;

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  abstract get name(): string;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(message: OutboundMessage): Promise<void>;

  isRunning(): boolean {
    return this.running;
  }

  isAllowed(userId: string): boolean {
    const allowFrom = this.config.allowFrom;
    if (!allowFrom || allowFrom.length === 0) {
      return true; // No restrictions
    }
    return allowFrom.includes(userId);
  }

  protected createInboundMessage(
    chatId: string,
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): InboundMessage {
    return {
      id: crypto.randomUUID(),
      channel: this.name,
      chatId,
      userId,
      content,
      timestamp: new Date(),
      metadata,
    };
  }
}
