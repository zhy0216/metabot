import { Tool } from "./base";
import type { SubagentTask } from "../types";

// Store for tracking subagent tasks
const subagentTasks: Map<string, SubagentTask> = new Map();

export function getSubagentTasks(): Map<string, SubagentTask> {
  return subagentTasks;
}

export function getSubagentTask(id: string): SubagentTask | undefined {
  return subagentTasks.get(id);
}

export class SpawnTool extends Tool {
  private onSpawn: (task: SubagentTask) => Promise<void>;

  constructor(onSpawn: (task: SubagentTask) => Promise<void>) {
    super();
    this.onSpawn = onSpawn;
  }

  get name() {
    return "spawn";
  }

  get description() {
    return "Spawn a subagent to handle a specific task asynchronously. The subagent will work independently and report back when done.";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        task: {
          type: "string" as const,
          description: "A detailed description of the task for the subagent to complete",
        },
        label: {
          type: "string" as const,
          description: "A short label to identify this subagent task",
        },
      },
      required: ["task", "label"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const task = args.task as string;
    const label = args.label as string;
    const id = crypto.randomUUID().slice(0, 8);

    const subagentTask: SubagentTask = {
      id,
      label,
      task,
      status: "pending",
      startedAt: new Date(),
      parentChannel: "", // Set by caller
      parentChatId: "", // Set by caller
    };

    subagentTasks.set(id, subagentTask);

    // Trigger the spawn handler (non-blocking)
    this.onSpawn(subagentTask).catch((error) => {
      subagentTask.status = "failed";
      subagentTask.error = error instanceof Error ? error.message : String(error);
      subagentTask.completedAt = new Date();
    });

    return `Subagent spawned (id: ${id}, label: "${label}"). It will work on the task and report back when done.`;
  }
}

export class MessageTool extends Tool {
  private onMessage: (channel: string, chatId: string, content: string) => Promise<void>;

  constructor(onMessage: (channel: string, chatId: string, content: string) => Promise<void>) {
    super();
    this.onMessage = onMessage;
  }

  get name() {
    return "message";
  }

  get description() {
    return "Send a message to a user or channel";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        channel: {
          type: "string" as const,
          description: "The channel to send the message to (e.g., 'telegram', 'discord', 'cli')",
        },
        chat_id: {
          type: "string" as const,
          description: "The chat/user ID to send the message to",
        },
        content: {
          type: "string" as const,
          description: "The message content to send",
        },
      },
      required: ["channel", "chat_id", "content"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const channel = args.channel as string;
    const chatId = args.chat_id as string;
    const content = args.content as string;

    await this.onMessage(channel, chatId, content);
    return `Message sent to ${channel}:${chatId}`;
  }
}
