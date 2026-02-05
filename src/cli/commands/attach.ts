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
