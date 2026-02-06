// src/ctl/__tests__/manager.test.ts
import { test, expect, beforeEach, mock } from "bun:test";
import { AgentManager } from "../manager";
import type { AgentAdapter, AgentOutput, WorkspaceConfig, LaunchOptions } from "../types";

// Mock adapter
const mockAdapter: AgentAdapter = {
  type: "mock",
  prepareWorkspace: async (config: WorkspaceConfig) => "/tmp/mock-workspace",
  buildLaunchCommand: (opts: LaunchOptions) => ["echo", "mock-agent"],
  formatPrompt: (p: string) => p,
  getReadyPattern: () => /\$\s*$/m,
  parseOutput: (raw: string) => ({ text: raw.trim() }),
  cleanup: async () => {},
};

// Mock tmux driver
const mockTmux = {
  createSession: mock(async () => {}),
  sendKeys: mock(async () => {}),
  capturePane: mock(async () => "mock output\n$ "),
  sessionExists: mock(async () => true),
  killSession: mock(async () => {}),
  getAttachCommand: (s: string) => `tmux attach -t ${s}`,
};

let manager: AgentManager;

beforeEach(() => {
  manager = new AgentManager(mockTmux as any);
  manager.registerAdapter(mockAdapter);
  mockTmux.createSession.mockClear();
  mockTmux.capturePane.mockClear();
  mockTmux.sendKeys.mockClear();
  mockTmux.killSession.mockClear();
  mockTmux.sessionExists.mockReset();
  mockTmux.sessionExists.mockResolvedValue(true);
});

test("registerAdapter makes type available", () => {
  expect(() => manager.spawn("nonexistent", {})).toThrow();
});

test("spawn creates agent and returns handle", async () => {
  // Simulate ready pattern appearing after launch
  mockTmux.capturePane.mockResolvedValue("Welcome\n$ ");
  const agent = await manager.spawn("mock", {});
  expect(agent.id).toBeTruthy();
  expect(agent.type).toBe("mock");
  expect(agent.status).toBe("idle");
  expect(mockTmux.createSession).toHaveBeenCalled();
});

test("list returns all agents", async () => {
  mockTmux.capturePane.mockResolvedValue("$ ");
  await manager.spawn("mock", {});
  await manager.spawn("mock", {});
  expect(manager.list().length).toBe(2);
});

test("kill removes agent", async () => {
  mockTmux.capturePane.mockResolvedValue("$ ");
  const agent = await manager.spawn("mock", {});
  await manager.kill(agent.id);
  expect(manager.list().length).toBe(0);
  expect(mockTmux.killSession).toHaveBeenCalled();
});

test("getStatus returns agent status", async () => {
  mockTmux.capturePane.mockResolvedValue("$ ");
  const agent = await manager.spawn("mock", {});
  expect(manager.getStatus(agent.id)).toBe("idle");
});

test("send injects prompt and returns parsed output", async () => {
  mockTmux.capturePane
    .mockResolvedValueOnce("$ ") // spawn ready check
    .mockResolvedValueOnce("working...") // first poll - no ready pattern
    .mockResolvedValue("The answer is 42\n$ "); // second poll - done
  const agent = await manager.spawn("mock", {});
  const result = await manager.send(agent.id, "what is 42?");
  expect(result.text).toContain("42");
  expect(mockTmux.sendKeys).toHaveBeenCalled();
});
