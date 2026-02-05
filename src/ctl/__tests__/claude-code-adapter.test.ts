// src/ctl/__tests__/claude-code-adapter.test.ts
import { test, expect, afterEach } from "bun:test";
import { ClaudeCodeAdapter } from "../adapters/claude-code";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

const adapter = new ClaudeCodeAdapter();
let workspacePath: string | null = null;

afterEach(async () => {
  if (workspacePath) {
    await rm(workspacePath, { recursive: true, force: true });
    workspacePath = null;
  }
});

test("type is claude-code", () => {
  expect(adapter.type).toBe("claude-code");
});

test("prepareWorkspace creates directory with CLAUDE.md", async () => {
  workspacePath = await adapter.prepareWorkspace({
    skills: [],
    instructions: "You are a test agent.",
  });
  expect(existsSync(workspacePath)).toBe(true);
  const claudeMd = Bun.file(`${workspacePath}/CLAUDE.md`);
  expect(await claudeMd.exists()).toBe(true);
  expect(await claudeMd.text()).toBe("You are a test agent.");
});

test("buildLaunchCommand returns claude command", () => {
  const cmd = adapter.buildLaunchCommand({
    workspacePath: "/tmp/test-ws",
    projectPath: "/home/user/myapp",
  });
  expect(cmd[0]).toBe("claude");
  expect(cmd).toContain("/home/user/myapp");
});

test("getReadyPattern matches Claude Code prompt", () => {
  const pattern = adapter.getReadyPattern();
  expect(pattern.test("> ")).toBe(true);
  expect(pattern.test("some output\n> ")).toBe(true);
});

test("formatPrompt returns plain text", () => {
  expect(adapter.formatPrompt("hello")).toBe("hello");
});

test("parseOutput strips ANSI and returns text", () => {
  const raw = "\x1b[32mHello World\x1b[0m\n> ";
  const output = adapter.parseOutput(raw);
  expect(output.text).toContain("Hello World");
  expect(output.text).not.toContain("\x1b");
});

test("cleanup removes workspace directory", async () => {
  workspacePath = await adapter.prepareWorkspace({ skills: [] });
  await adapter.cleanup(workspacePath);
  expect(existsSync(workspacePath)).toBe(false);
  workspacePath = null; // already cleaned
});
