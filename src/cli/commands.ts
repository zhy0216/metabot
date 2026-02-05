import { loadConfig, getConfig, saveConfig } from "../config";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";

export async function runChat(message?: string): Promise<void> {
  await loadConfig();

  // Import ctl module lazily to avoid circular deps
  const { TmuxDriver } = await import("../ctl/tmux");
  const { AgentManager } = await import("../ctl/manager");
  const { ClaudeCodeAdapter } = await import("../ctl/adapters/claude-code");

  const tmux = new TmuxDriver();
  const manager = new AgentManager(tmux);
  manager.registerAdapter(new ClaudeCodeAdapter());

  const config = getConfig();

  // Spawn a Claude Code agent
  const agent = await manager.spawn("claude-code", {
    project: process.cwd(),
    model: config.agent.model,
  });

  if (message) {
    // Single message mode
    const response = await manager.send(agent.id, message);
    console.log(response.text);
    await manager.kill(agent.id);
    return;
  }

  // Interactive mode - attach to the tmux session
  console.log("Attaching to Claude Code session...");
  console.log("Use Ctrl+B D to detach, or exit Claude Code to end.\n");

  const attachCmd = manager.getAttachCommand(agent.id);
  const proc = Bun.spawn(["sh", "-c", attachCmd], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;

  // Clean up after detach/exit
  try {
    await manager.kill(agent.id);
  } catch {
    // Session may already be dead
  }
}

export async function runGateway(): Promise<void> {
  await loadConfig();

  console.log("Gateway mode is not yet implemented for ctl-based architecture.");
  console.log("Use 'botctl spawn' to create agents and 'botctl send' to interact.");
}

export async function runOnboard(): Promise<void> {
  const workspaceDir = join(homedir(), ".botctl");

  console.log("Setting up botctl workspace...\n");

  // Create directories
  const dirs = [
    workspaceDir,
    join(workspaceDir, "sessions"),
    join(workspaceDir, "skills"),
    join(workspaceDir, "memory"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Create default config
  await loadConfig();
  const config = getConfig();
  await saveConfig(config);

  // Create default workspace files
  const agentsContent = `# Agent Instructions

You are a helpful AI assistant. Your capabilities include:

- Reading and writing files
- Executing shell commands
- Searching the web
- Spawning subagents for complex tasks

## Guidelines

- Be concise and helpful
- Use tools when needed
- Break complex tasks into smaller steps
`;

  const soulContent = `# Personality

You are friendly, knowledgeable, and efficient. You aim to help users accomplish their goals with minimal friction.
`;

  await Bun.write(join(workspaceDir, "AGENTS.md"), agentsContent);
  await Bun.write(join(workspaceDir, "SOUL.md"), soulContent);

  console.log("✅ Workspace created at:", workspaceDir);
  console.log("\nTo get started:");
  console.log("  1. Run: botctl spawn");
  console.log("  2. Run: botctl send <agent-id> 'your message'");
  console.log("\nOr for interactive mode:");
  console.log("  Run: bun run chat");
}

export async function runStatus(): Promise<void> {
  await loadConfig();
  const config = getConfig();

  console.log("botctl status\n");
  console.log("Workspace:", config.workspace);
  console.log("Model:", config.agent.model);

  // Check for tmux
  const tmuxCheck = Bun.spawn(["which", "tmux"], { stdout: "pipe" });
  const tmuxPath = await new Response(tmuxCheck.stdout).text();

  if (tmuxPath.trim()) {
    console.log("\n✅ tmux found:", tmuxPath.trim());
  } else {
    console.log("\n❌ tmux not found - required for agent management");
  }

  // Check for claude CLI
  const claudeCheck = Bun.spawn(["which", "claude"], { stdout: "pipe" });
  const claudePath = await new Response(claudeCheck.stdout).text();

  if (claudePath.trim()) {
    console.log("✅ claude found:", claudePath.trim());
  } else {
    console.log("❌ claude not found - install Claude Code CLI");
  }
}
