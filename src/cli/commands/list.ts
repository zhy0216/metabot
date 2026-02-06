// src/cli/commands/list.ts
import { getManager } from "./spawn";

export async function runList(): Promise<void> {
  const manager = getManager();
  const agents = manager.list();

  if (agents.length === 0) {
    console.log("No agents running");
    return;
  }

  for (const a of agents) {
    const age = Math.round((Date.now() - a.createdAt.getTime()) / 1000);
    const ageStr = age < 60 ? `${age}s` : `${Math.round(age / 60)}m`;
    console.log(`${a.id}\t${a.type}\t${a.status}\t${a.workspacePath}\t${ageStr} ago`);
  }
}
