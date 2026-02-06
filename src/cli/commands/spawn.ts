// src/cli/commands/spawn.ts
import { AgentManager, TmuxDriver, ClaudeCodeAdapter } from "../../ctl";
import { loadConfig, getConfig } from "../../config";
import { resolve } from "node:path";

let _manager: AgentManager | null = null;

export function getManager(): AgentManager {
  if (!_manager) {
    const tmux = new TmuxDriver();
    _manager = new AgentManager(tmux);
    _manager.registerAdapter(new ClaudeCodeAdapter());
  }
  return _manager;
}

export async function runSpawn(args: string[]): Promise<void> {
  const type = args[0];
  if (!type) {
    console.error("Usage: botctl spawn <agent-type> [--skill <path>] [--model <model>] [--project <path>]");
    process.exit(1);
  }

  const skills: string[] = [];
  let model: string | undefined;
  let projectPath: string | undefined;

  let i = 1;
  while (i < args.length) {
    if (args[i] === "--skill" && args[i + 1]) {
      skills.push(args[i + 1]!);
      i += 2;
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[i + 1];
      i += 2;
    } else if (args[i] === "--project" && args[i + 1]) {
      projectPath = resolve(args[i + 1]!);
      i += 2;
    } else {
      i++;
    }
  }

  // Determine workspace path: --project flag > config workspace
  await loadConfig();
  const config = getConfig();
  const workspacePath = projectPath ?? config.workspace;

  const manager = getManager();
  const agent = await manager.spawn(type, { skills, model, workspacePath });
  console.log(`Spawned ${agent.id} (${agent.type})`);
}
