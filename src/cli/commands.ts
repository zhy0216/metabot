import { loadConfig, getConfig, saveConfig } from "../config";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";
import { TuiChannel } from "../channels";

export async function runChat(message?: string): Promise<void> {
  const channel = new TuiChannel({ name: "tui", message });
  await channel.start();
}

export async function runGateway(): Promise<void> {
  await loadConfig();

  console.log("Gateway mode is not yet implemented for ctl-based architecture.");
  console.log("Use 'botctl spawn' to create agents and 'botctl send' to interact.");
}

export async function runOnboard(): Promise<void> {
  const workspaceDir = join(homedir(), ".metabot", "workspace");

  console.log("Setting up botctl workspace...\n");

  const dirs = [
    workspaceDir,
    join(workspaceDir, "sessions"),
    join(workspaceDir, "skills"),
    join(workspaceDir, "memory"),
    join(workspaceDir, "agents"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  const templateDir = join(import.meta.dir, "../workspace");
  const templateFiles = [
    "AGENTS.md",
    "SOUL.md",
    "USER.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "memory/MEMORY.md",
  ];

  const created: string[] = [];
  const skipped: string[] = [];

  for (const relPath of templateFiles) {
    const dest = join(workspaceDir, relPath);
    const destFile = Bun.file(dest);
    if (await destFile.exists()) {
      skipped.push(relPath);
      continue;
    }
    const src = Bun.file(join(templateDir, relPath));
    if (await src.exists()) {
      await Bun.write(dest, src);
      created.push(relPath);
    }
  }

  await loadConfig();
  const config = getConfig();
  await saveConfig(config);

  console.log("Workspace:", workspaceDir);
  if (created.length > 0) {
    console.log("\nCreated:");
    for (const f of created) console.log(`  ${f}`);
  }
  if (skipped.length > 0) {
    console.log("\nSkipped (already exist):");
    for (const f of skipped) console.log(`  ${f}`);
  }

  console.log("\nTo get started:");
  console.log("  botctl spawn claude-code");
  console.log("  botctl spawn claude-code --project ./myapp");
}

export async function runStatus(): Promise<void> {
  await loadConfig();
  const config = getConfig();

  console.log("botctl status\n");
  console.log("Workspace:", config.workspace);
  console.log("Model:", config.agent.model);

  const tmuxCheck = Bun.spawn(["which", "tmux"], { stdout: "pipe" });
  const tmuxPath = await new Response(tmuxCheck.stdout).text();

  if (tmuxPath.trim()) {
    console.log("\n✅ tmux found:", tmuxPath.trim());
  } else {
    console.log("\n❌ tmux not found - required for agent management");
  }

  const claudeCheck = Bun.spawn(["which", "claude"], { stdout: "pipe" });
  const claudePath = await new Response(claudeCheck.stdout).text();

  if (claudePath.trim()) {
    console.log("✅ claude found:", claudePath.trim());
  } else {
    console.log("❌ claude not found - install Claude Code CLI");
  }
}
