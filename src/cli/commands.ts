import { createInterface } from "readline";
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
  // Gateway now runs inside the daemon process.
  // Import and run the daemon server directly (blocks in foreground).
  await import("../daemon/server");
  // server.ts self-starts and runs channels — this await keeps the process alive
  await new Promise(() => {}); // block forever
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

  // Channel setup
  const existingToken = config.channels?.telegram?.botToken;
  const setupTelegram = await promptYesNo(
    existingToken
      ? `\nTelegram bot token already configured. Reconfigure? (y/n): `
      : `\nSet up Telegram channel? (y/n): `,
  );
  if (setupTelegram) {
    console.log("\nTo create a Telegram bot:");
    console.log("  1. Open Telegram and search for @BotFather");
    console.log("  2. Send /newbot and follow the prompts");
    console.log("  3. Copy the bot token\n");

    const token = await promptInput(
      existingToken ? `Bot token (Enter to keep current): ` : `Bot token: `,
    );
    const botToken = token.trim() || existingToken;
    if (botToken) {
      const existingUsers = config.channels?.telegram?.allowedUsers;
      const usersInput = await promptInput(
        `Allowed user IDs (comma-separated, Enter to ${existingUsers?.length ? "keep current" : "allow all"}): `,
      );
      const allowedUsers = usersInput.trim()
        ? usersInput.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n))
        : existingUsers;

      config.channels = {
        ...config.channels,
        telegram: {
          botToken,
          ...(allowedUsers?.length ? { allowedUsers } : {}),
        },
      };
      await saveConfig(config);
      console.log("Telegram channel config saved.");
    } else {
      console.log("Skipped — no token provided.");
    }
  }

  console.log("\nTo get started:");
  console.log("  botctl spawn claude-code");
  console.log("  botctl spawn claude-code --project ./myapp");
  if (config.channels?.telegram?.botToken) {
    console.log("  botctl telegram              # Start Telegram bot");
    console.log("  botctl gateway               # Start all channels");
  }
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

export async function runTelegram(): Promise<void> {
  // Telegram now runs inside the daemon. Just start the daemon.
  await runGateway();
}

function promptInput(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function promptYesNo(prompt: string): Promise<boolean> {
  const answer = await promptInput(prompt);
  return answer.trim().toLowerCase().startsWith("y");
}
