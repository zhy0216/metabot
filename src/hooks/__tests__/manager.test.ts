// src/hooks/__tests__/manager.test.ts
import { test, expect, mock } from "bun:test";
import { HookManager } from "../manager";
import type { Hook, HookContext } from "../types";

const baseCtx: HookContext = {
  agentId: "agent-1",
  agentType: "mock",
  workspacePath: "/tmp/test",
  timestamp: Date.now(),
};

test("emit calls registered hook handlers", async () => {
  const hm = new HookManager();
  const fn = mock(async () => {});

  hm.register({ name: "test", event: "afterSend", handler: fn });
  await hm.emit("afterSend", { ...baseCtx, prompt: "hi", output: "hello" });

  expect(fn).toHaveBeenCalledTimes(1);
});

test("emit does nothing for unregistered events", async () => {
  const hm = new HookManager();
  // Should not throw
  await hm.emit("afterSpawn", baseCtx);
});

test("multiple hooks on same event are called in order", async () => {
  const hm = new HookManager();
  const order: number[] = [];

  hm.register({
    name: "first",
    event: "afterSend",
    handler: async () => { order.push(1); },
  });
  hm.register({
    name: "second",
    event: "afterSend",
    handler: async () => { order.push(2); },
  });

  await hm.emit("afterSend", baseCtx);
  expect(order).toEqual([1, 2]);
});

test("failing hook does not block other hooks", async () => {
  const hm = new HookManager();
  const fn = mock(async () => {});

  hm.register({
    name: "failing",
    event: "afterSend",
    handler: async () => { throw new Error("boom"); },
  });
  hm.register({ name: "healthy", event: "afterSend", handler: fn });

  await hm.emit("afterSend", baseCtx);
  expect(fn).toHaveBeenCalledTimes(1);
});

test("hooks on different events are independent", async () => {
  const hm = new HookManager();
  const sendFn = mock(async () => {});
  const spawnFn = mock(async () => {});

  hm.register({ name: "send", event: "afterSend", handler: sendFn });
  hm.register({ name: "spawn", event: "afterSpawn", handler: spawnFn });

  await hm.emit("afterSend", baseCtx);
  expect(sendFn).toHaveBeenCalledTimes(1);
  expect(spawnFn).toHaveBeenCalledTimes(0);
});
