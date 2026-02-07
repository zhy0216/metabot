import { ensureDaemon } from "../../daemon/lifecycle";

export async function runSkill(args: string[]): Promise<void> {
  const id = args[0];
  const skillPath = args[1];
  if (!id || !skillPath) {
    console.error("Usage: botctl skill <agent-id> <skill-path>");
    process.exit(1);
  }

  const client = await ensureDaemon();
  await client.loadSkill(id, skillPath);
  const filename = skillPath.split("/").pop();
  console.log(`Loaded ${filename}`);
}
