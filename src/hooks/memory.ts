import type { Hook, HookContext } from "./types";
import type { AgentAdapter } from "../ctl/types";
import {
  getOrCreateSession,
  updateLastResponseTime,
} from "../memory/session";
import {
  readSessionMemory,
  writeSessionMemory,
  appendInteraction,
  appendChatLog,
  formatDate,
} from "../memory/store";

export function createMemoryHook(
  getAdapter: (type: string) => AgentAdapter,
): Hook {
  return {
    name: "memory",
    event: "afterSend",
    async handler(ctx: HookContext) {
      if (!ctx.prompt || !ctx.output) return;

      const now = ctx.timestamp;
      const { sessionId, isNew } = await getOrCreateSession(ctx.agentId, now);
      const date = formatDate(now);
      const time = new Date(now).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      await appendInteraction(sessionId, now, {
        time,
        prompt: ctx.prompt.slice(0, 200),
        summary: "(summarizing...)",
      });

      await appendChatLog(sessionId, date, "user", ctx.prompt, now);
      await appendChatLog(sessionId, date, "assistant", ctx.output, now);

      await updateLastResponseTime(ctx.agentId, now);

      const adapter = getAdapter(ctx.agentType);
      const existingMemory = await readSessionMemory(sessionId, date);

      try {
        const updated = await adapter.summarizeMemory({
          prompt: ctx.prompt,
          output: ctx.output,
          existingMemory,
          sessionId,
        });

        if (updated) {
          await writeSessionMemory(sessionId, date, updated);
        }
      } catch (err) {
        console.error(`[memory] summarize failed:`, err);
      }
    },
  };
}
