// src/ctl/__tests__/integration.test.ts
import { test, expect, afterAll } from "bun:test";
import { AgentManager } from "../manager";
import { TmuxDriver } from "../tmux";
import type { AgentAdapter, WorkspaceConfig, LaunchOptions, AgentOutput } from "../types";

// Simple bash adapter for testing
const bashAdapter: AgentAdapter = {
  type: "bash-test",
  async prepareWorkspace(config: WorkspaceConfig) {
    const dir = `/tmp/botctl-test-${crypto.randomUUID().slice(0, 8)}`;
    await Bun.spawn(["mkdir", "-p", dir]).exited;
    return dir;
  },
  buildLaunchCommand(opts: LaunchOptions) {
    return ["bash"];
  },
  formatPrompt(prompt: string) {
    return prompt;
  },
  getReadyPattern() {
    return /\$\s*$/m;
  },
  parseOutput(raw: string): AgentOutput {
    return { text: raw.trim() };
  },
  async cleanup(workspacePath: string) {
    await Bun.spawn(["rm", "-rf", workspacePath]).exited;
  },
};

const tmux = new TmuxDriver();
const manager = new AgentManager(tmux);
manager.registerAdapter(bashAdapter);

let agentId: string | null = null;

afterAll(async () => {
  if (agentId) {
    try { await manager.kill(agentId); } catch {}
  }
});

test("full lifecycle: spawn, send, output, kill", async () => {
  const agent = await manager.spawn("bash-test", {});
  agentId = agent.id;
  expect(agent.status).toBe("idle");
  expect(manager.list().length).toBe(1);

  const result = await manager.send(agent.id, "echo BOTCTL_TEST_123");
  expect(result.text).toContain("BOTCTL_TEST_123");

  const output = await manager.getOutput(agent.id);
  expect(output).toContain("BOTCTL_TEST_123");

  await manager.kill(agent.id);
  agentId = null;
  expect(manager.list().length).toBe(0);
});
