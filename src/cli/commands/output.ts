import { ensureDaemon } from "../../daemon/lifecycle";

export async function runOutput(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: botctl output <agent-id>");
    process.exit(1);
  }

  const client = await ensureDaemon();
  const output = await client.getOutput(id);
  console.log(output);
}
