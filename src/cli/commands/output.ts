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
