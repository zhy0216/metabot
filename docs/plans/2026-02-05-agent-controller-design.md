# Agent Controller Design

Control external AI agents (Claude Code, Codex, OpenCode) through tmux sessions with a unified interface for loading skills, tools, and running prompts.

## Architecture

```
botctl CLI  -->  AgentManager  -->  Adapters  -->  tmux sessions
                                    - ClaudeCode     - claude
                                    - Codex          - codex
                                    - OpenCode       - opencode
```

AgentManager is the central coordinator. It maintains a registry of running agents, their tmux session IDs, and their adapters. Adapters implement the AgentAdapter interface - they know how to prepare the workspace, construct the launch command, send prompts, and parse output for their specific agent type.

Workspaces are minimal directories created per-agent containing skills and agent-specific config. The actual project the agent works on is passed as a working directory argument.

## Adapter Interface

```typescript
interface AgentAdapter {
  readonly type: string;
  prepareWorkspace(config: WorkspaceConfig): Promise<string>;
  buildLaunchCommand(opts: LaunchOptions): string[];
  formatPrompt(prompt: string): string;
  getReadyPattern(): RegExp;
  parseOutput(raw: string): AgentOutput;
  cleanup(workspacePath: string): Promise<void>;
}

interface WorkspaceConfig {
  skills: string[];
  instructions?: string;
  env?: Record<string, string>;
}

interface LaunchOptions {
  workspacePath: string;
  projectPath: string;
  model?: string;
}

interface AgentOutput {
  text: string;
  toolCalls?: ToolCall[];
  error?: string;
}
```

## AgentManager

```typescript
interface Agent {
  id: string;
  type: string;
  sessionName: string;
  workspacePath: string;
  projectPath: string;
  status: "idle" | "working" | "dead";
  createdAt: Date;
}

class AgentManager {
  registerAdapter(adapter: AgentAdapter): void;
  async spawn(type: string, config: SpawnConfig): Promise<Agent>;
  async send(id: string, prompt: string): Promise<AgentOutput>;
  async sendAsync(id: string, prompt: string): Promise<void>;
  getStatus(id: string): Agent["status"];
  async getOutput(id: string): Promise<string>;
  async loadSkill(id: string, skillPath: string): Promise<void>;
  async kill(id: string): Promise<void>;
  getAttachCommand(id: string): string;
  list(): Agent[];
}
```

Spawn flow: Create ID -> adapter prepares workspace -> create tmux session -> run agent command -> wait for ready pattern -> return agent handle.

Send flow: Inject prompt via `tmux send-keys` -> poll `tmux capture-pane` -> detect ready pattern or idle timeout -> adapter parses output -> return result.

## Tmux Integration

```typescript
class TmuxDriver {
  async createSession(name: string, cmd: string[], cwd: string): Promise<void>;
  async sendKeys(session: string, text: string): Promise<void>;
  async capturePane(session: string, lines?: number): Promise<string>;
  async sessionExists(session: string): Promise<boolean>;
  async killSession(session: string): Promise<void>;
  getAttachCommand(session: string): string;
}
```

Completion detection: poll capturePane in a loop. Primary signal is the adapter's ready pattern (regex). Fallback is idle timeout (no new output for 5s). Poll interval is 200ms.

## CLI

```
botctl spawn claude-code --project ./myapp --skill ./skills/debugging.md
botctl send <id> "fix the memory leak"
botctl send --async <id> "refactor auth"
botctl status <id>
botctl output <id>
botctl skill <id> ./skills/testing.md
botctl attach <id>
botctl list
botctl kill <id>
```

## File Structure

```
src/
  ctl/
    index.ts            # Exports
    manager.ts          # AgentManager
    tmux.ts             # TmuxDriver
    types.ts            # Interfaces
    adapters/
      base.ts           # Shared utilities
      claude-code.ts    # Claude Code adapter
      codex.ts          # Future
      opencode.ts       # Future
  cli/
    commands/
      spawn.ts
      send.ts
      status.ts
      output.ts
      skill.ts
      attach.ts
      list.ts
      kill.ts
```

## Starting Scope

Build the Claude Code adapter first. Codex and OpenCode adapters added later when needed.

## Out of Scope

- Agent-to-agent communication
- Shared memory between agents
- Web UI
