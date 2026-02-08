import { BaseChannel } from "./base";
import type { ChannelConfig } from "./types";
import { getConfig } from "../config";

const API_BASE = "https://api.telegram.org/bot";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
}

interface TelegramChannelConfig extends ChannelConfig {
  botToken?: string;
  allowedUsers?: number[];
}

export class TelegramChannel extends BaseChannel {
  private botToken!: string;
  private allowedUsers?: number[];
  private running = false;
  private offset = 0;

  constructor(config: TelegramChannelConfig) {
    super(config);
    if (config.botToken) this.botToken = config.botToken;
    this.allowedUsers = config.allowedUsers;
  }

  protected async run(): Promise<void> {
    if (!this.botToken) {
      const appConfig = getConfig();
      const token = appConfig.channels?.telegram?.botToken;
      if (!token) {
        throw new Error(
          "Telegram bot token not configured. Run 'botctl onboard' to set up.",
        );
      }
      this.botToken = token;
      this.allowedUsers ??= appConfig.channels?.telegram?.allowedUsers;
    }

    this.running = true;

    const me = await this.api("getMe");
    console.log(`Telegram bot @${me.result.username} started (polling)`);

    process.on("SIGINT", () => {
      this.running = false;
    });
    process.on("SIGTERM", () => {
      this.running = false;
    });

    while (this.running) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          await this.handleUpdate(update);
        }
      } catch (err) {
        if (!this.running) break;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Polling error: ${msg}`);
        await Bun.sleep(3000);
      }
    }

    console.log("Telegram bot stopped");
    await this.stop();
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const data = await this.api("getUpdates", {
      offset: this.offset,
      timeout: 30,
    });
    const updates = data.result as TelegramUpdate[];
    for (const u of updates) {
      this.offset = u.update_id + 1;
    }
    return updates;
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text === "/start") {
      await this.sendMessage(
        chatId,
        `Hello! I'm a metabot agent. Send me a message and I'll respond.\n\nYour user ID: ${userId}`,
      );
      return;
    }

    if (this.allowedUsers && !this.allowedUsers.includes(userId)) {
      await this.sendMessage(chatId, "Sorry, you are not authorized.");
      return;
    }

    await this.sendChatAction(chatId, "typing");

    try {
      const response = await this.client.send(this.agent.id, text);
      const reply = response.text || "(no response)";

      // Telegram has a 4096 char limit per message
      if (reply.length <= 4096) {
        await this.sendMessage(chatId, reply);
      } else {
        for (let i = 0; i < reply.length; i += 4096) {
          await this.sendMessage(chatId, reply.slice(i, i + 4096));
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.sendMessage(chatId, `Error: ${errMsg}`);
    }
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    await this.api("sendMessage", { chat_id: chatId, text });
  }

  private async sendChatAction(
    chatId: number,
    action: string,
  ): Promise<void> {
    await this.api("sendChatAction", { chat_id: chatId, action });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async api(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<{ ok: boolean; result: any }> {
    const url = `${API_BASE}${this.botToken}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
    });
    const data = (await res.json()) as { ok: boolean; result: unknown; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description ?? res.status}`);
    }
    return data;
  }
}
