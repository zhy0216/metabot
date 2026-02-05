# Agent Controller Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a controller layer to botctl that manages external AI agents (starting with Claude Code) through tmux sessions with a unified adapter-based interface.

**Architecture:** AgentManager coordinates agents. Each agent type has an adapter that knows how to prepare workspaces, launch the agent, send prompts, and parse output. TmuxDriver handles all tmux subprocess interaction. CLI commands wrap the programmatic API.

**Tech Stack:** Bun, TypeScript, tmux (via `Bun.$`), existing botctl patterns (abstract base classes, singleton exports)

---

### Task 1: Types and interfaces

**Files:**
- Create: `src/ctl/types.ts`

**Step 1: Write the types file**

```typescript
// src/ctl/types.ts
import type { ToolCall } from "../types";

export interface WorkspaceConfig {
  skills: string[];
  instructions?: string;
  env?: Record<string, string>;
}

export interface LaunchOptions {
  workspacePath: string;
  projectPath: string;
  model?: string;
}

export interface AgentOutput {
  text: string;
  toolCalls?: ToolCall[];
  error?: string;
}

export interface SpawnConfig {
  project: string;
  skills?: string[];
  instructions?: string;
  model?: string;
  env?: Record<string, string>;
}

export interface AgentHandle {
  id: string;
  type: string;
  sessionName: string;
  workspacePath: string;
  projectPath: string;
  status: "idle" | "working" | "dead";
  createdAt: Date;
}

export interface AgentAdapter {
  readonly type: string;
  prepareWorkspace(config: WorkspaceConfig): Promise<string>;
  buildLaunchCommand(opts: LaunchOptions): string[];
  formatPrompt(prompt: string): string;
  getReadyPattern(): RegExp;
  parseOutput(raw: string): AgentOutput;
  cleanup(workspacePath: string): Promise<void>;
}
```

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit src/ctl/types.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/ctl/types.ts
git commit -m "feat(ctl): add types and interfaces for agent controller"
```

---

### Task 2: TmuxDriver

**Files:**
- Create: `src/ctl/tmux.ts`
- Create: `src/ctl/__tests__/tmux.test.ts`

**Step 1: Write the failing test**

```typescript
// src/ctl/__tests__/tmux.test.ts
import { test, expect, afterEach } from "bun:test";
import { TmuxDriver } from "../tmux";

const tmux = new TmuxDriver();
const testSession = `botctl-test-${Date.now()}`;

afterEach(async () => {
  try {
    await tmux.killSession(testSession);
  } catch {}
});

test("createSession starts a detached tmux session", async () => {
  await tmux.createSession(testSession, ["bash"], "/tmp");
  const exists = await tmux.sessionExists(testSession);
  expect(exists).toBe(true);
});

test("sessionExists returns false for nonexistent session", async () => {
  const exists = await tmux.sessionExists("botctl-nonexistent-session");
  expect(exists).toBe(false);
});

test("sendKeys and capturePane round-trip", async () => {
  await tmux.createSession(testSession, ["bash"], "/tmp");
  await Bun.sleep(500);
  await tmux.sendKeys(testSession, "echo HELLO_BOTCTL");
  await Bun.sleep(500);
  const output = await tmux.capturePane(testSession);
  expect(output).toContain("HELLO_BOTCTL");
});

test("killSession removes the session", async () => {
  await tmux.createSession(testSession, ["bash"], "/tmp");
  await tmux.killSession(testSession);
  const exists = await tmux.sessionExists(testSession);
  expect(exists).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/ctl/__tests__/tmux.test.ts`
Expected: FAIL - cannot resolve `../tmux`

**Step 3: Write the TmuxDriver implementation**

```typescript
// src/ctl/tmux.ts
import { $ } from "bun";

export class TmuxDriver {
  async createSession(name: string, cmd: string[], cwd: string): Promise<void> {
    const cmdStr = cmd.join(" ");
    await $`tmux new-session -d -s ${name} -c ${cwd} ${cmdStr}`.quiet();
  }

  async sendKeys(session: string, text: string): Promise<void> {
    await $`tmux send-keys -t ${session} ${text} Enter`.quiet();
  }

  async capturePane(session: string, lines: number = 1000): Promise<string> {
    const result = await $`tmux capture-pane -t ${session} -p -S -${lines}`.quiet();
    return result.text();
  }

  async sessionExists(session: string): Promise<boolean> {
    try {
      await $`tmux has-session -t ${session}`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async killSession(session: string): Promise<void> {
    await $`tmux kill-session -t ${session}`.quiet();
  }

  getAttachCommand(session: string): string {
    return `tmux attach -t ${session}`;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test src/ctl/__tests__/tmux.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/ctl/tmux.ts src/ctl/__tests__/tmux.test.ts
git commit -m "feat(ctl): add TmuxDriver for tmux session management"
```

---

### Task 3: Base adapter utilities

**Files:**
- Create: `src/ctl/adapters/base.ts`

**Step 1: Write the base adapter file**

This provides shared helpers used by all adapters: ANSI stripping, workspace directory creation, skill file copying.

```typescript
// src/ctl/adapters/base.ts
import { mkdir, cp } from "node:fs/promises";
import { join, basename } from "node:path";
import type { AgentAdapter, WorkspaceConfig } from "../types";

// Strip ANSI escape codes from terminal output
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

// Create a temp workspace directory and populate with skills
export async function createWorkspaceDir(prefix: string): Promise<string> {
  const id = crypto.randomUUID().slice(0, 8);
  const dir = join("/tmp", `botctl-${prefix}-${id}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// Copy skill files into a target directory
export async function copySkills(skills: string[], targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  for (const skill of skills) {
    const file = Bun.file(skill);
    if (await file.exists()) {
      const dest = join(targetDir, basename(skill));
      await Bun.write(dest, file);
    }
  }
}
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/ctl/adapters/base.ts
git commit -m "feat(ctl): add base adapter utilities (stripAnsi, workspace helpers)"
```

---

### Task 4: Claude Code adapter

**Files:**
- Create: `src/ctl/adapters/claude-code.ts`
- Create: `src/ctl/__tests__/claude-code-adapter.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test src/ctl/__tests__/claude-code-adapter.test.ts`
Expected: FAIL - cannot resolve `../adapters/claude-code`

**Step 3: Write the Claude Code adapter**

```typescript
// src/ctl/adapters/claude-code.ts
import { join } from "node:path";
import { rm, mkdir } from "node:fs/promises";
import type { AgentAdapter, WorkspaceConfig, LaunchOptions, AgentOutput } from "../types";
import { stripAnsi, createWorkspaceDir, copySkills } from "./base";

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly type = "claude-code";

  async prepareWorkspace(config: WorkspaceConfig): Promise<string> {
    const dir = await createWorkspaceDir("claude");

    // Copy skills
    if (config.skills.length > 0) {
      await copySkills(config.skills, join(dir, "skills"));
    }

    // Write CLAUDE.md instructions
    if (config.instructions) {
      await Bun.write(join(dir, "CLAUDE.md"), config.instructions);
    }

    return dir;
  }

  buildLaunchCommand(opts: LaunchOptions): string[] {
    const cmd = ["claude", "--dangerously-skip-permissions"];
    if (opts.model) {
      cmd.push("--model", opts.model);
    }
    // Last arg is the project directory
    cmd.push(opts.projectPath);
    return cmd;
  }

  formatPrompt(prompt: string): string {
    return prompt;
  }

  getReadyPattern(): RegExp {
    return />\s*$/m;
  }

  parseOutput(raw: string): AgentOutput {
    const clean = stripAnsi(raw);
    // Remove trailing prompt marker
    const text = clean.replace(/>\s*$/m, "").trim();
    return { text };
  }

  async cleanup(workspacePath: string): Promise<void> {
    await rm(workspacePath, { recursive: true, force: true });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test src/ctl/__tests__/claude-code-adapter.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/ctl/adapters/claude-code.ts src/ctl/__tests__/claude-code-adapter.test.ts
git commit -m "feat(ctl): add Claude Code adapter"
```

---

### Task 5: AgentManager

**Files:**
- Create: `src/ctl/manager.ts`
- Create: `src/ctl/__tests__/manager.test.ts`

**Step 1: Write the failing test**

These tests use a mock adapter and mock tmux driver so they run without tmux.

```typescript
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
  expect(() => manager.spawn("nonexistent", { project: "/tmp" })).toThrow();
});

test("spawn creates agent and returns handle", async () => {
  // Simulate ready pattern appearing after launch
  mockTmux.capturePane.mockResolvedValue("Welcome\n$ ");
  const agent = await manager.spawn("mock", { project: "/tmp/proj" });
  expect(agent.id).toBeTruthy();
  expect(agent.type).toBe("mock");
  expect(agent.status).toBe("idle");
  expect(mockTmux.createSession).toHaveBeenCalled();
});

test("list returns all agents", async () => {
  mockTmux.capturePane.mockResolvedValue("$ ");
  await manager.spawn("mock", { project: "/tmp/proj" });
  await manager.spawn("mock", { project: "/tmp/proj2" });
  expect(manager.list().length).toBe(2);
});

test("kill removes agent", async () => {
  mockTmux.capturePane.mockResolvedValue("$ ");
  const agent = await manager.spawn("mock", { project: "/tmp/proj" });
  await manager.kill(agent.id);
  expect(manager.list().length).toBe(0);
  expect(mockTmux.killSession).toHaveBeenCalled();
});

test("getStatus returns agent status", async () => {
  mockTmux.capturePane.mockResolvedValue("$ ");
  const agent = await manager.spawn("mock", { project: "/tmp/proj" });
  expect(manager.getStatus(agent.id)).toBe("idle");
});

test("send injects prompt and returns parsed output", async () => {
  mockTmux.capturePane
    .mockResolvedValueOnce("$ ") // spawn ready check
    .mockResolvedValueOnce("working...") // first poll - no ready pattern
    .mockResolvedValue("The answer is 42\n$ "); // second poll - done
  const agent = await manager.spawn("mock", { project: "/tmp/proj" });
  const result = await manager.send(agent.id, "what is 42?");
  expect(result.text).toContain("42");
  expect(mockTmux.sendKeys).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/ctl/__tests__/manager.test.ts`
Expected: FAIL - cannot resolve `../manager`

**Step 3: Write the AgentManager**

```typescript
// src/ctl/manager.ts
import type { TmuxDriver } from "./tmux";
import type { AgentAdapter, AgentHandle, AgentOutput, SpawnConfig } from "./types";

export class AgentManager {
  private agents: Map<string, AgentHandle> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();
  private tmux: TmuxDriver;

  constructor(tmux: TmuxDriver) {
    this.tmux = tmux;
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  private getAdapter(type: string): AgentAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`Unknown agent type: ${type}`);
    return adapter;
  }

  private getAgent(id: string): AgentHandle {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Unknown agent: ${id}`);
    return agent;
  }

  async spawn(type: string, config: SpawnConfig): Promise<AgentHandle> {
    const adapter = this.getAdapter(type);
    const id = `agent-${crypto.randomUUID().slice(0, 8)}`;
    const sessionName = `botctl-${id}`;

    const workspacePath = await adapter.prepareWorkspace({
      skills: config.skills ?? [],
      instructions: config.instructions,
      env: config.env,
    });

    const cmd = adapter.buildLaunchCommand({
      workspacePath,
      projectPath: config.project,
      model: config.model,
    });

    await this.tmux.createSession(sessionName, cmd, workspacePath);

    // Wait for agent to be ready
    await this.waitForReady(sessionName, adapter);

    const agent: AgentHandle = {
      id,
      type,
      sessionName,
      workspacePath,
      projectPath: config.project,
      status: "idle",
      createdAt: new Date(),
    };

    this.agents.set(id, agent);
    return agent;
  }

  async send(id: string, prompt: string): Promise<AgentOutput> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);

    agent.status = "working";
    const formatted = adapter.formatPrompt(prompt);
    await this.tmux.sendKeys(agent.sessionName, formatted);

    const raw = await this.waitForReady(agent.sessionName, adapter);
    agent.status = "idle";

    return adapter.parseOutput(raw);
  }

  async sendAsync(id: string, prompt: string): Promise<void> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);

    agent.status = "working";
    const formatted = adapter.formatPrompt(prompt);
    await this.tmux.sendKeys(agent.sessionName, formatted);
  }

  getStatus(id: string): AgentHandle["status"] {
    return this.getAgent(id).status;
  }

  async getOutput(id: string): Promise<string> {
    const agent = this.getAgent(id);
    return this.tmux.capturePane(agent.sessionName);
  }

  async loadSkill(id: string, skillPath: string): Promise<void> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);
    // Re-prepare workspace skill directory
    const { copySkills } = await import("./adapters/base");
    const { join } = await import("node:path");
    await copySkills([skillPath], join(agent.workspacePath, "skills"));
  }

  async kill(id: string): Promise<void> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);
    await this.tmux.killSession(agent.sessionName);
    await adapter.cleanup(agent.workspacePath);
    this.agents.delete(id);
  }

  getAttachCommand(id: string): string {
    const agent = this.getAgent(id);
    return this.tmux.getAttachCommand(agent.sessionName);
  }

  list(): AgentHandle[] {
    return Array.from(this.agents.values());
  }

  private async waitForReady(
    session: string,
    adapter: AgentAdapter,
    idleTimeoutMs: number = 5000,
    pollIntervalMs: number = 200,
  ): Promise<string> {
    const pattern = adapter.getReadyPattern();
    let lastOutput = "";
    let lastChangeTime = Date.now();

    while (true) {
      const output = await this.tmux.capturePane(session);

      if (output !== lastOutput) {
        lastOutput = output;
        lastChangeTime = Date.now();
      }

      // Primary: prompt marker detected
      if (pattern.test(output)) return output;

      // Fallback: idle timeout
      if (Date.now() - lastChangeTime > idleTimeoutMs) return output;

      await Bun.sleep(pollIntervalMs);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test src/ctl/__tests__/manager.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/ctl/manager.ts src/ctl/__tests__/manager.test.ts
git commit -m "feat(ctl): add AgentManager with spawn, send, kill, list"
```

---

### Task 6: Barrel export

**Files:**
- Create: `src/ctl/index.ts`
- Modify: `src/index.ts`

**Step 1: Write the ctl barrel export**

```typescript
// src/ctl/index.ts
export * from "./types";
export { TmuxDriver } from "./tmux";
export { AgentManager } from "./manager";
export { ClaudeCodeAdapter } from "./adapters/claude-code";
export { stripAnsi, createWorkspaceDir, copySkills } from "./adapters/base";
```

**Step 2: Add ctl export to main barrel**

Add to `src/index.ts`:
```typescript
export * from "./ctl";
```

**Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/ctl/index.ts src/index.ts
git commit -m "feat(ctl): add barrel exports"
```

---

### Task 7: CLI command - spawn

**Files:**
- Create: `src/cli/commands/spawn.ts`
- Modify: `src/cli/index.ts`

**Step 1: Write the spawn command**

```typescript
// src/cli/commands/spawn.ts
import { AgentManager, TmuxDriver, ClaudeCodeAdapter } from "../../ctl";

let _manager: AgentManager | null = null;

export function getManager(): AgentManager {
  if (!_manager) {
    const tmux = new TmuxDriver();
    _manager = new AgentManager(tmux);
    _manager.registerAdapter(new ClaudeCodeAdapter());
  }
  return _manager;
}

export async function runSpawn(args: string[]): Promise<void> {
  const type = args[0];
  if (!type) {
    console.error("Usage: botctl spawn <agent-type> --project <path> [--skill <path>] [--model <model>]");
    process.exit(1);
  }

  const projectIdx = args.indexOf("--project");
  const project = projectIdx !== -1 ? args[projectIdx + 1] : undefined;
  if (!project) {
    console.error("--project is required");
    process.exit(1);
  }

  const skills: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--skill" && args[i + 1]) {
      skills.push(args[i + 1]);
      i += 2;
    } else {
      i++;
    }
  }

  const modelIdx = args.indexOf("--model");
  const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

  const manager = getManager();
  const agent = await manager.spawn(type, { project, skills, model });
  console.log(`Spawned ${agent.id} (${agent.type})`);
}
```

**Step 2: Wire spawn into CLI**

In `src/cli/index.ts`, add:
```typescript
import { runSpawn, getManager } from "./commands/spawn";
```

Add case to switch:
```typescript
case "spawn":
  await runSpawn(args.slice(1));
  break;
```

**Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/cli/commands/spawn.ts src/cli/index.ts
git commit -m "feat(cli): add spawn command"
```

---

### Task 8: CLI commands - send, output, status

**Files:**
- Create: `src/cli/commands/send.ts`
- Create: `src/cli/commands/output.ts`
- Modify: `src/cli/index.ts`

**Step 1: Write the send command**

```typescript
// src/cli/commands/send.ts
import { getManager } from "./spawn";

export async function runSend(args: string[]): Promise<void> {
  const isAsync = args[0] === "--async";
  const remaining = isAsync ? args.slice(1) : args;
  const id = remaining[0];
  const prompt = remaining.slice(1).join(" ");

  if (!id || !prompt) {
    console.error("Usage: botctl send [--async] <agent-id> <prompt>");
    process.exit(1);
  }

  const manager = getManager();

  if (isAsync) {
    await manager.sendAsync(id, prompt);
    console.log("Prompt sent");
  } else {
    const result = await manager.send(id, prompt);
    if (result.error) {
      console.error(`Error: ${result.error}`);
    } else {
      console.log(result.text);
    }
  }
}
```

**Step 2: Write the output command**

```typescript
// src/cli/commands/output.ts
import { getManager } from "./spawn";

export async function runOutput(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: botctl output <agent-id>");
    process.exit(1);
  }

  const manager = getManager();
  const output = await manager.getOutput(id);
  console.log(output);
}
```

**Step 3: Wire into CLI**

Add imports and cases to `src/cli/index.ts` for `send`, `output`, and expand `status` to show agent list when given an agent ID.

Add cases:
```typescript
case "send":
  await runSend(args.slice(1));
  break;

case "output":
  await runOutput(args.slice(1));
  break;
```

**Step 4: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/cli/commands/send.ts src/cli/commands/output.ts src/cli/index.ts
git commit -m "feat(cli): add send and output commands"
```

---

### Task 9: CLI commands - list, kill, attach, skill

**Files:**
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/kill.ts`
- Create: `src/cli/commands/attach.ts`
- Create: `src/cli/commands/skill.ts`
- Modify: `src/cli/index.ts`

**Step 1: Write list command**

```typescript
// src/cli/commands/list.ts
import { getManager } from "./spawn";

export async function runList(): Promise<void> {
  const manager = getManager();
  const agents = manager.list();

  if (agents.length === 0) {
    console.log("No agents running");
    return;
  }

  for (const a of agents) {
    const age = Math.round((Date.now() - a.createdAt.getTime()) / 1000);
    const ageStr = age < 60 ? `${age}s` : `${Math.round(age / 60)}m`;
    console.log(`${a.id}\t${a.type}\t${a.status}\t${a.projectPath}\t${ageStr} ago`);
  }
}
```

**Step 2: Write kill command**

```typescript
// src/cli/commands/kill.ts
import { getManager } from "./spawn";

export async function runKill(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: botctl kill <agent-id>");
    process.exit(1);
  }

  const manager = getManager();
  await manager.kill(id);
  console.log(`Killed ${id}`);
}
```

**Step 3: Write attach command**

```typescript
// src/cli/commands/attach.ts
import { getManager } from "./spawn";

export async function runAttach(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: botctl attach <agent-id>");
    process.exit(1);
  }

  const manager = getManager();
  const cmd = manager.getAttachCommand(id);
  console.log(`Attaching... (detach with Ctrl+B, D)`);
  const proc = Bun.spawn(["sh", "-c", cmd], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}
```

**Step 4: Write skill command**

```typescript
// src/cli/commands/skill.ts
import { getManager } from "./spawn";

export async function runSkill(args: string[]): Promise<void> {
  const id = args[0];
  const skillPath = args[1];
  if (!id || !skillPath) {
    console.error("Usage: botctl skill <agent-id> <skill-path>");
    process.exit(1);
  }

  const manager = getManager();
  await manager.loadSkill(id, skillPath);
  const filename = skillPath.split("/").pop();
  console.log(`Loaded ${filename}`);
}
```

**Step 5: Wire all into CLI index**

Add imports and cases for `list`, `kill`, `attach`, `skill` to `src/cli/index.ts`.

Update `printHelp()` to include new commands.

**Step 6: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/cli/commands/list.ts src/cli/commands/kill.ts src/cli/commands/attach.ts src/cli/commands/skill.ts src/cli/index.ts
git commit -m "feat(cli): add list, kill, attach, and skill commands"
```

---

### Task 10: Integration test

**Files:**
- Create: `src/ctl/__tests__/integration.test.ts`

**Step 1: Write integration test**

This test requires tmux to be installed. It spawns a real bash session (not Claude Code) to test the full flow end-to-end.

```typescript
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
  const agent = await manager.spawn("bash-test", { project: "/tmp" });
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
```

**Step 2: Run integration test**

Run: `bun test src/ctl/__tests__/integration.test.ts`
Expected: PASS (requires tmux installed)

**Step 3: Commit**

```bash
git add src/ctl/__tests__/integration.test.ts
git commit -m "test(ctl): add integration test with bash adapter"
```

---

### Task 11: Run all tests, final typecheck

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix any remaining issues from full test run"
```
