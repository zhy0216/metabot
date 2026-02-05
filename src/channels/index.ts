import type { OutboundMessage } from "../types";
import { getConfig } from "../config";
import { bus } from "../bus";
import { BaseChannel } from "./base";
import { CLIChannel } from "./cli";

export { BaseChannel } from "./base";
export { CLIChannel } from "./cli";

export class ChannelManager {
  private channels: Map<string, BaseChannel> = new Map();

  register(channel: BaseChannel): void {
    this.channels.set(channel.name, channel);
  }

  get(name: string): BaseChannel | undefined {
    return this.channels.get(name);
  }

  async startAll(): Promise<void> {
    // Subscribe to route outbound messages
    bus.onOutbound(async (message) => {
      const channel = this.channels.get(message.channel);
      if (channel && channel.isRunning()) {
        await channel.send(message);
      }
    });

    // Start all registered channels
    for (const channel of this.channels.values()) {
      await channel.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
  }

  getRunning(): BaseChannel[] {
    return Array.from(this.channels.values()).filter((c) => c.isRunning());
  }
}

export const channelManager = new ChannelManager();

// Factory function to create channels from config
export function createChannelsFromConfig(): void {
  const config = getConfig();

  if (config.channels.cli?.enabled !== false) {
    channelManager.register(new CLIChannel(config.channels.cli));
  }

  // Add more channel types here as they're implemented
  // if (config.channels.telegram?.enabled) { ... }
  // if (config.channels.discord?.enabled) { ... }
}
