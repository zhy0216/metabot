// src/ctl/manager.ts
import type { TmuxDriver } from "./tmux";
import type { AgentAdapter, AgentHandle, AgentOutput, SpawnConfig } from "./types";

export class AgentManager {
  private agents: Map<string, AgentHandle> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();
  private tmux: TmuxDriver;

  constructor(tmux: TmuxDriver) {
    this.tmux = tmux;
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  private getAdapter(type: string): AgentAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`Unknown agent type: ${type}`);
    return adapter;
  }

  private getAgent(id: string): AgentHandle {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Unknown agent: ${id}`);
    return agent;
  }

  async spawn(type: string, config: SpawnConfig): Promise<AgentHandle> {
    const adapter = this.getAdapter(type);
    const id = `agent-${crypto.randomUUID().slice(0, 8)}`;
    const sessionName = `botctl-${id}`;

    const workspacePath = await adapter.prepareWorkspace({
      skills: config.skills ?? [],
      instructions: config.instructions,
      env: config.env,
    });

    const cmd = adapter.buildLaunchCommand({
      workspacePath,
      projectPath: config.project,
      model: config.model,
    });

    await this.tmux.createSession(sessionName, cmd, workspacePath);

    // Wait for agent to be ready
    await this.waitForReady(sessionName, adapter);

    const agent: AgentHandle = {
      id,
      type,
      sessionName,
      workspacePath,
      projectPath: config.project,
      status: "idle",
      createdAt: new Date(),
    };

    this.agents.set(id, agent);
    return agent;
  }

  async send(id: string, prompt: string): Promise<AgentOutput> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);

    agent.status = "working";
    const formatted = adapter.formatPrompt(prompt);
    await this.tmux.sendKeys(agent.sessionName, formatted);

    const raw = await this.waitForReady(agent.sessionName, adapter);
    agent.status = "idle";

    return adapter.parseOutput(raw);
  }

  async sendAsync(id: string, prompt: string): Promise<void> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);

    agent.status = "working";
    const formatted = adapter.formatPrompt(prompt);
    await this.tmux.sendKeys(agent.sessionName, formatted);
  }

  getStatus(id: string): AgentHandle["status"] {
    return this.getAgent(id).status;
  }

  async getOutput(id: string): Promise<string> {
    const agent = this.getAgent(id);
    return this.tmux.capturePane(agent.sessionName);
  }

  async loadSkill(id: string, skillPath: string): Promise<void> {
    const agent = this.getAgent(id);
    const { copySkills } = await import("./adapters/base");
    const { join } = await import("node:path");
    await copySkills([skillPath], join(agent.workspacePath, "skills"));
  }

  async kill(id: string): Promise<void> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);
    await this.tmux.killSession(agent.sessionName);
    await adapter.cleanup(agent.workspacePath);
    this.agents.delete(id);
  }

  getAttachCommand(id: string): string {
    const agent = this.getAgent(id);
    return this.tmux.getAttachCommand(agent.sessionName);
  }

  list(): AgentHandle[] {
    return Array.from(this.agents.values());
  }

  private async waitForReady(
    session: string,
    adapter: AgentAdapter,
    idleTimeoutMs: number = 5000,
    pollIntervalMs: number = 200,
  ): Promise<string> {
    const pattern = adapter.getReadyPattern();
    let lastOutput = "";
    let lastChangeTime = Date.now();

    while (true) {
      const output = await this.tmux.capturePane(session);

      if (output !== lastOutput) {
        lastOutput = output;
        lastChangeTime = Date.now();
      }

      // Primary: prompt marker detected
      if (pattern.test(output)) return output;

      // Fallback: idle timeout
      if (Date.now() - lastChangeTime > idleTimeoutMs) return output;

      await Bun.sleep(pollIntervalMs);
    }
  }
}
