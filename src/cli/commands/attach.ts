// src/cli/commands/attach.ts
import { ensureDaemon } from "../../daemon/lifecycle";

export async function runAttach(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: botctl attach <agent-id>");
    process.exit(1);
  }

  const client = await ensureDaemon();
  const cmd = await client.getAttachCommand(id);
  console.log(`Attaching... (detach with Ctrl+B, D)`);
  const proc = Bun.spawn(["sh", "-c", cmd], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}
