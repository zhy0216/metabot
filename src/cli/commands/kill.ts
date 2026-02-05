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
