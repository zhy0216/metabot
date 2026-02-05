import * as readline from "readline";
import { BaseChannel } from "./base";
import type { OutboundMessage, ChannelConfig } from "../types";
import { bus } from "../bus";

export class CLIChannel extends BaseChannel {
  private rl: readline.Interface | null = null;
  private chatId = "cli-default";
  private userId = "cli-user";

  constructor(config: ChannelConfig = {}) {
    super(config);
  }

  get name(): string {
    return "cli";
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Subscribe to outbound messages
    bus.onOutbound(async (message) => {
      await this.send(message);
    }, "cli");

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n🤖 Bot ready. Type your message (Ctrl+C to exit)\n");

    this.rl.on("line", async (line) => {
      const content = line.trim();
      if (!content) return;

      const message = this.createInboundMessage(
        this.chatId,
        this.userId,
        content
      );

      await bus.publishInbound(message);
    });

    this.rl.on("close", () => {
      this.stop();
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  async send(message: OutboundMessage): Promise<void> {
    console.log(`\n${message.content}\n`);
  }
}
