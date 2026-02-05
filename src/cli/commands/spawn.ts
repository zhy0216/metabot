// src/cli/commands/spawn.ts
import { AgentManager, TmuxDriver, ClaudeCodeAdapter } from "../../ctl";

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
    console.error("Usage: botctl spawn <agent-type> --project <path> [--skill <path>] [--model <model>]");
    process.exit(1);
  }

  const projectIdx = args.indexOf("--project");
  const project = projectIdx !== -1 ? args[projectIdx + 1] : undefined;
  if (!project) {
    console.error("--project is required");
    process.exit(1);
  }

  const skills: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--skill" && args[i + 1]) {
      skills.push(args[i + 1]!);
      i += 2;
    } else {
      i++;
    }
  }

  const modelIdx = args.indexOf("--model");
  const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

  const manager = getManager();
  const agent = await manager.spawn(type, { project, skills, model });
  console.log(`Spawned ${agent.id} (${agent.type})`);
}
