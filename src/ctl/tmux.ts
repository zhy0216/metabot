// src/ctl/tmux.ts
import { $ } from "bun";

export class TmuxDriver {
  async createSession(name: string, cmd: string[], cwd: string): Promise<void> {
    const cmdStr = cmd.join(" ");
    await $`tmux new-session -d -s ${name} -c ${cwd} ${cmdStr}`.quiet();
  }

  async sendKeys(session: string, text: string): Promise<void> {
    await $`tmux send-keys -t ${session} ${text} Enter`.quiet();
  }

  async capturePane(session: string, lines: number = 1000): Promise<string> {
    const result = await $`tmux capture-pane -t ${session} -p -S -${lines}`.quiet();
    return result.text();
  }

  async sessionExists(session: string): Promise<boolean> {
    try {
      await $`tmux has-session -t ${session}`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async killSession(session: string): Promise<void> {
    await $`tmux kill-session -t ${session}`.quiet();
  }

  getAttachCommand(session: string): string {
    return `tmux attach -t ${session}`;
  }
}
