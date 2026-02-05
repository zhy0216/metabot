import { loadConfig, getConfig, saveConfig } from "../config";
import { agentLoop } from "../agent";
import { channelManager, createChannelsFromConfig, CLIChannel } from "../channels";
import { bus } from "../bus";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";

export async function runChat(message?: string): Promise<void> {
  await loadConfig();

  if (message) {
    // Single message mode
    const response = await agentLoop.processMessage(message);
    console.log(response);
    return;
  }

  // Interactive mode
  await agentLoop.start();
  createChannelsFromConfig();
  await channelManager.startAll();
}

export async function runGateway(): Promise<void> {
  await loadConfig();
  await agentLoop.start();
  createChannelsFromConfig();
  await channelManager.startAll();

  console.log("Gateway started. Channels:", channelManager.getRunning().map((c) => c.name).join(", "));

  // Keep running
  await new Promise(() => {});
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
- Spawn subagents for independent, parallelizable work
`;

  const soulContent = `# Personality

You are friendly, knowledgeable, and efficient. You aim to help users accomplish their goals with minimal friction.
`;

  await Bun.write(join(workspaceDir, "AGENTS.md"), agentsContent);
  await Bun.write(join(workspaceDir, "SOUL.md"), soulContent);

  console.log("✅ Workspace created at:", workspaceDir);
  console.log("\nTo get started:");
  console.log("  1. Set ANTHROPIC_API_KEY environment variable");
  console.log("  2. Run: bun run chat");
  console.log("\nOr customize your config at:", join(workspaceDir, "config.json"));
}

export async function runStatus(): Promise<void> {
  await loadConfig();
  const config = getConfig();

  console.log("botctl status\n");
  console.log("Workspace:", config.workspace);
  console.log("Provider:", config.agent.provider);
  console.log("Model:", config.agent.model);

  // Check provider
  const providers = Object.entries(config.providers).filter(
    ([_, p]) => p?.enabled || p?.apiKey
  );
  console.log("\nConfigured providers:");
  for (const [name, p] of providers) {
    console.log(`  - ${name}: ${p?.apiKey ? "✅ API key set" : "❌ No API key"}`);
  }

  if (providers.length === 0) {
    console.log("  (none)");
  }
}
