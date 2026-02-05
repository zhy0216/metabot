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

// Integration tests for prepareWorkspace

test("prepareWorkspace copies workspace template files", async () => {
  workspacePath = await adapter.prepareWorkspace({});

  // Verify template files are copied
  const expectedFiles = ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md", "USER.md"];
  for (const file of expectedFiles) {
    const f = Bun.file(`${workspacePath}/${file}`);
    expect(await f.exists()).toBe(true);
  }

  // Verify memory directory exists
  expect(existsSync(`${workspacePath}/memory`)).toBe(true);
});

test("prepareWorkspace copies skills to skills/ directory", async () => {
  // Create a temporary skill file
  const tempSkillPath = `/tmp/test-skill-${crypto.randomUUID().slice(0, 8)}.md`;
  await Bun.write(tempSkillPath, "# Test Skill\nThis is a test skill.");

  try {
    workspacePath = await adapter.prepareWorkspace({
      skills: [tempSkillPath],
    });

    // Verify skills directory exists
    expect(existsSync(`${workspacePath}/skills`)).toBe(true);

    // Verify skill file was copied
    const copiedSkill = Bun.file(`${workspacePath}/skills/${tempSkillPath.split("/").pop()}`);
    expect(await copiedSkill.exists()).toBe(true);
    expect(await copiedSkill.text()).toBe("# Test Skill\nThis is a test skill.");
  } finally {
    await rm(tempSkillPath, { force: true });
  }
});

test("prepareWorkspace creates .claude/settings.json with mcps", async () => {
  workspacePath = await adapter.prepareWorkspace({
    mcps: ["mcp-server-1", "mcp-server-2"],
  });

  const settingsFile = Bun.file(`${workspacePath}/.claude/settings.json`);
  expect(await settingsFile.exists()).toBe(true);

  const settings = await settingsFile.json();
  expect(settings.mcpServers).toEqual(["mcp-server-1", "mcp-server-2"]);
});

test("prepareWorkspace creates .claude/settings.json with tools", async () => {
  workspacePath = await adapter.prepareWorkspace({
    tools: ["Read", "Write", "Bash"],
  });

  const settingsFile = Bun.file(`${workspacePath}/.claude/settings.json`);
  expect(await settingsFile.exists()).toBe(true);

  const settings = await settingsFile.json();
  expect(settings.allowedTools).toEqual(["Read", "Write", "Bash"]);
});

test("prepareWorkspace creates .claude/settings.json with plugins", async () => {
  workspacePath = await adapter.prepareWorkspace({
    plugins: ["plugin-a", "plugin-b"],
  });

  const settingsFile = Bun.file(`${workspacePath}/.claude/settings.json`);
  expect(await settingsFile.exists()).toBe(true);

  const settings = await settingsFile.json();
  expect(settings.plugins).toEqual(["plugin-a", "plugin-b"]);
});

test("prepareWorkspace creates complete workspace with all config options", async () => {
  // Create temp skill files
  const skill1Path = `/tmp/skill1-${crypto.randomUUID().slice(0, 8)}.md`;
  const skill2Path = `/tmp/skill2-${crypto.randomUUID().slice(0, 8)}.md`;
  await Bun.write(skill1Path, "# Skill 1");
  await Bun.write(skill2Path, "# Skill 2");

  try {
    workspacePath = await adapter.prepareWorkspace({
      skills: [skill1Path, skill2Path],
      instructions: "You are an expert assistant.",
      mcps: ["pencil-mcp"],
      tools: ["Read", "Write"],
      plugins: ["my-plugin"],
    });

    // Verify template files
    expect(await Bun.file(`${workspacePath}/AGENTS.md`).exists()).toBe(true);
    expect(await Bun.file(`${workspacePath}/TOOLS.md`).exists()).toBe(true);

    // Verify CLAUDE.md
    const claudeMd = await Bun.file(`${workspacePath}/CLAUDE.md`).text();
    expect(claudeMd).toBe("You are an expert assistant.");

    // Verify skills copied
    expect(await Bun.file(`${workspacePath}/skills/${skill1Path.split("/").pop()}`).exists()).toBe(true);
    expect(await Bun.file(`${workspacePath}/skills/${skill2Path.split("/").pop()}`).exists()).toBe(true);

    // Verify settings.json
    const settings = await Bun.file(`${workspacePath}/.claude/settings.json`).json();
    expect(settings.mcpServers).toEqual(["pencil-mcp"]);
    expect(settings.allowedTools).toEqual(["Read", "Write"]);
    expect(settings.plugins).toEqual(["my-plugin"]);
  } finally {
    await rm(skill1Path, { force: true });
    await rm(skill2Path, { force: true });
  }
});

test("prepareWorkspace skips non-existent skill files", async () => {
  workspacePath = await adapter.prepareWorkspace({
    skills: ["/tmp/non-existent-skill-file-12345.md"],
  });

  // Skills directory should still be created
  expect(existsSync(`${workspacePath}/skills`)).toBe(true);

  // But no file should be copied
  const skillsDir = await Bun.$`ls ${workspacePath}/skills 2>/dev/null || echo ""`.text();
  expect(skillsDir.trim()).toBe("");
});
