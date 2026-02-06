// src/cli/commands/kill.ts
import { ensureDaemon } from "../../daemon/lifecycle";

export async function runKill(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: botctl kill <agent-id>");
    process.exit(1);
  }

  const client = await ensureDaemon();
  await client.kill(id);
  console.log(`Killed ${id}`);
}
