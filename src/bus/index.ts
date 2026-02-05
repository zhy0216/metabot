import type { InboundMessage, OutboundMessage } from "../types";

type MessageHandler<T> = (message: T) => void | Promise<void>;

interface Subscription {
  id: string;
  unsubscribe: () => void;
}

class MessageBus {
  private inboundHandlers: Map<string, MessageHandler<InboundMessage>[]> = new Map();
  private outboundHandlers: Map<string, MessageHandler<OutboundMessage>[]> = new Map();
  private globalInboundHandlers: MessageHandler<InboundMessage>[] = [];
  private globalOutboundHandlers: MessageHandler<OutboundMessage>[] = [];

  // Subscribe to inbound messages (from channels to agent)
  onInbound(handler: MessageHandler<InboundMessage>, channel?: string): Subscription {
    const id = crypto.randomUUID();

    if (channel) {
      const handlers = this.inboundHandlers.get(channel) ?? [];
      handlers.push(handler);
      this.inboundHandlers.set(channel, handlers);

      return {
        id,
        unsubscribe: () => {
          const h = this.inboundHandlers.get(channel) ?? [];
          this.inboundHandlers.set(channel, h.filter((x) => x !== handler));
        },
      };
    }

    this.globalInboundHandlers.push(handler);
    return {
      id,
      unsubscribe: () => {
        this.globalInboundHandlers = this.globalInboundHandlers.filter((x) => x !== handler);
      },
    };
  }

  // Subscribe to outbound messages (from agent to channels)
  onOutbound(handler: MessageHandler<OutboundMessage>, channel?: string): Subscription {
    const id = crypto.randomUUID();

    if (channel) {
      const handlers = this.outboundHandlers.get(channel) ?? [];
      handlers.push(handler);
      this.outboundHandlers.set(channel, handlers);

      return {
        id,
        unsubscribe: () => {
          const h = this.outboundHandlers.get(channel) ?? [];
          this.outboundHandlers.set(channel, h.filter((x) => x !== handler));
        },
      };
    }

    this.globalOutboundHandlers.push(handler);
    return {
      id,
      unsubscribe: () => {
        this.globalOutboundHandlers = this.globalOutboundHandlers.filter((x) => x !== handler);
      },
    };
  }

  // Publish inbound message (channel -> agent)
  async publishInbound(message: InboundMessage): Promise<void> {
    const channelHandlers = this.inboundHandlers.get(message.channel) ?? [];
    const allHandlers = [...this.globalInboundHandlers, ...channelHandlers];

    await Promise.all(allHandlers.map((h) => h(message)));
  }

  // Publish outbound message (agent -> channel)
  async publishOutbound(message: OutboundMessage): Promise<void> {
    const channelHandlers = this.outboundHandlers.get(message.channel) ?? [];
    const allHandlers = [...this.globalOutboundHandlers, ...channelHandlers];

    await Promise.all(allHandlers.map((h) => h(message)));
  }

  // Create a queue for async message processing
  createQueue<T extends InboundMessage | OutboundMessage>(): AsyncQueue<T> {
    return new AsyncQueue<T>();
  }
}

// Async queue for buffered message processing
export class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: T) => void)[] = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  async pop(): Promise<T | null> {
    if (this.closed && this.queue.length === 0) return null;

    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }

    return new Promise<T>((resolve) => {
      this.resolvers.push(resolve as (value: T) => void);
    });
  }

  close(): void {
    this.closed = true;
    // Resolve any pending promises with null
    for (const resolve of this.resolvers) {
      resolve(null as unknown as T);
    }
    this.resolvers = [];
  }

  get length(): number {
    return this.queue.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

// Singleton instance
export const bus = new MessageBus();
export type { MessageBus, Subscription };
