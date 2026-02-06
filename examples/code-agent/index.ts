// examples/code-agent/index.ts
// Demonstrates a focused coding agent that implements features from specs

import { AgentManager, TmuxDriver, ClaudeCodeAdapter } from "../../src";

const CODER_INSTRUCTIONS = `
You are a focused coding agent. Your job is to:
1. Implement features exactly as specified
2. Write clean, well-structured code
3. Include basic error handling
4. Keep implementations minimal - no over-engineering

When you complete a task, summarize what you created.
`;

async function main() {
  const tmux = new TmuxDriver();
  const manager = new AgentManager(tmux);
  manager.registerAdapter(new ClaudeCodeAdapter());

  console.log("🚀 Spawning code agent...");

  const coder = await manager.spawn("claude-code", {
    instructions: CODER_INSTRUCTIONS,
  });

  console.log(`✓ Code agent spawned: ${coder.id}`);
  console.log(`  Workspace: ${coder.workspacePath}`);

  // Task 1: Create a utility module
  console.log("\n📝 Task 1: Create a string utility module");
  const task1 = `
Create a file "utils/string.ts" with these functions:
- capitalize(str: string): string - capitalizes first letter
- slugify(str: string): string - converts to url-friendly slug
- truncate(str: string, length: number): string - truncates with "..."

Export all functions. Use TypeScript.
`;

  const response1 = await manager.send(coder.id, task1);
  console.log("✓ Task 1 complete");
  console.log(response1.text.slice(0, 300) + "...\n");

  // Show final structure
  console.log("📂 Workspace:", coder.workspacePath);

  // Interactive: attach to agent for manual inspection
  const attachCmd = manager.getAttachCommand(coder.id);
  console.log(`\n💡 To interact with the agent directly:\n   ${attachCmd}`);

  // Cleanup prompt
  console.log("\n🧹 Press Ctrl+C to cleanup and exit, or attach to continue working.");

  // Keep alive for inspection
  process.on("SIGINT", async () => {
    console.log("\nCleaning up...");
    await manager.kill(coder.id);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch(console.error);
