import { join } from "path";
import type { Message, Session } from "../types";
import { getConfig } from "../config";

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private maxHistory: number;

  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
  }

  private getSessionId(channel: string, chatId: string): string {
    return `${channel}:${chatId}`;
  }

  private getSessionPath(sessionId: string): string {
    const config = getConfig();
    const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(config.workspace, "sessions", `${sanitized}.jsonl`);
  }

  async get(channel: string, chatId: string): Promise<Session> {
    const sessionId = this.getSessionId(channel, chatId);

    // Check memory cache
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    // Try to load from disk
    const session = await this.load(sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }

  private async load(sessionId: string): Promise<Session> {
    const path = this.getSessionPath(sessionId);
    const file = Bun.file(path);

    const [channel, chatId] = sessionId.split(":");

    if (!(await file.exists())) {
      return {
        id: sessionId,
        channel,
        chatId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    try {
      const content = await file.text();
      const lines = content.trim().split("\n").filter(Boolean);
      const messages: Message[] = lines.map((line) => {
        const parsed = JSON.parse(line);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });

      // Only keep recent messages
      const recentMessages = messages.slice(-this.maxHistory);

      return {
        id: sessionId,
        channel,
        chatId,
        messages: recentMessages,
        createdAt: messages[0]?.timestamp ?? new Date(),
        updatedAt: messages[messages.length - 1]?.timestamp ?? new Date(),
      };
    } catch {
      return {
        id: sessionId,
        channel,
        chatId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  async addMessage(channel: string, chatId: string, message: Omit<Message, "id" | "timestamp">): Promise<Message> {
    const session = await this.get(channel, chatId);

    const fullMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    session.messages.push(fullMessage);
    session.updatedAt = fullMessage.timestamp;

    // Trim to max history
    if (session.messages.length > this.maxHistory) {
      session.messages = session.messages.slice(-this.maxHistory);
    }

    // Persist to disk
    await this.persist(session, fullMessage);

    return fullMessage;
  }

  private async persist(session: Session, message: Message): Promise<void> {
    const path = this.getSessionPath(session.id);

    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    await Bun.write(join(dir, ".gitkeep"), "");

    // Append message as JSONL
    const line = JSON.stringify({
      ...message,
      timestamp: message.timestamp.toISOString(),
    }) + "\n";

    const file = Bun.file(path);
    const existing = (await file.exists()) ? await file.text() : "";
    await Bun.write(path, existing + line);
  }

  async clear(channel: string, chatId: string): Promise<void> {
    const sessionId = this.getSessionId(channel, chatId);
    this.sessions.delete(sessionId);

    const path = this.getSessionPath(sessionId);
    const file = Bun.file(path);
    if (await file.exists()) {
      await Bun.write(path, "");
    }
  }

  getHistory(channel: string, chatId: string, limit?: number): Message[] {
    const sessionId = this.getSessionId(channel, chatId);
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const messages = session.messages;
    return limit ? messages.slice(-limit) : messages;
  }
}

export const sessionManager = new SessionManager();
