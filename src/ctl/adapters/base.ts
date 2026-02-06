// src/ctl/adapters/base.ts
import { mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// Strip ANSI escape codes from terminal output
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

// Create a workspace directory under ~/.metabot/workspace/agents/
export async function createWorkspaceDir(prefix: string): Promise<string> {
  const id = crypto.randomUUID().slice(0, 8);
  const agentsDir = join(homedir(), ".metabot", "workspace", "agents");
  const dir = join(agentsDir, `${prefix}-${id}`);

  await mkdir(agentsDir, { recursive: true });

  // Copy workspace template
  const templateDir = join(import.meta.dir, "../../workspace");
  await Bun.$`cp -r ${templateDir} ${dir}`.quiet();

  return dir;
}

// Copy skill files into a target directory
export async function copySkills(skills: string[], targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  for (const skill of skills) {
    const file = Bun.file(skill);
    if (await file.exists()) {
      const dest = join(targetDir, basename(skill));
      await Bun.write(dest, file);
    }
  }
}
