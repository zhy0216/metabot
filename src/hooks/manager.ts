// src/hooks/manager.ts

import type { Hook, HookEvent, HookContext } from "./types";

export class HookManager {
  private hooks: Map<HookEvent, Hook[]> = new Map();

  register(hook: Hook): void {
    const list = this.hooks.get(hook.event) ?? [];
    list.push(hook);
    this.hooks.set(hook.event, list);
  }

  async emit(event: HookEvent, ctx: HookContext): Promise<void> {
    const hooks = this.hooks.get(event);
    if (!hooks) return;

    for (const hook of hooks) {
      try {
        await hook.handler(ctx);
      } catch (err) {
        console.error(`[hook:${hook.name}] error:`, err);
      }
    }
  }
}
