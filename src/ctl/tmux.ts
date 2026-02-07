export class TmuxDriver {
  async createSession(name: string, cmd: string[], cwd: string): Promise<void> {
    const args = ["new-session", "-d", "-s", name, "-c", cwd, ...cmd];
    const proc = Bun.spawn(["tmux", ...args], { stdout: "ignore", stderr: "ignore" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Failed to create tmux session: ${name}`);
    }
  }

  async sendKeys(session: string, text: string): Promise<void> {
    const proc = Bun.spawn(["tmux", "send-keys", "-t", session, text, "Enter"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Failed to send keys to session: ${session}`);
    }
  }

  async capturePane(session: string, lines: number = 1000): Promise<string> {
    const proc = Bun.spawn(["tmux", "capture-pane", "-t", session, "-p", "-S", `-${lines}`], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output;
  }

  async sessionExists(session: string): Promise<boolean> {
    const proc = Bun.spawn(["tmux", "has-session", "-t", session], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  }

  async killSession(session: string): Promise<void> {
    const proc = Bun.spawn(["tmux", "kill-session", "-t", session], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }

  getAttachCommand(session: string): string {
    return `tmux attach -t ${session}`;
  }
}
