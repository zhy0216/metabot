// src/cli/commands/skill.ts
import { getManager } from "./spawn";

export async function runSkill(args: string[]): Promise<void> {
  const id = args[0];
  const skillPath = args[1];
  if (!id || !skillPath) {
    console.error("Usage: botctl skill <agent-id> <skill-path>");
    process.exit(1);
  }

  const manager = getManager();
  await manager.loadSkill(id, skillPath);
  const filename = skillPath.split("/").pop();
  console.log(`Loaded ${filename}`);
}
