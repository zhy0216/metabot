import { join } from "node:path";
import { copySkills } from "./adapters/base";
import type { TmuxDriver } from "./tmux";
import type { AgentAdapter, AgentHandle, AgentOutput, SpawnConfig } from "./types";
import type { HookManager } from "../hooks/manager";

export class AgentManager {
  private agents: Map<string, AgentHandle> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();
  private tmux: TmuxDriver;
  private hookManager?: HookManager;

  constructor(tmux: TmuxDriver, hookManager?: HookManager) {
    this.tmux = tmux;
    this.hookManager = hookManager;
  }

  setHookManager(hm: HookManager): void {
    this.hookManager = hm;
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  getAdapter(type: string): AgentAdapter {
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

    let workspacePath: string;
    let persistent = false;

    if (config.workspacePath) {
      workspacePath = config.workspacePath;
      persistent = true;
    } else {
      workspacePath = await adapter.prepareWorkspace({
        skills: config.skills ?? [],
        instructions: config.instructions,
        env: config.env,
      });
    }

    const cmd = adapter.buildLaunchCommand({
      workspacePath,
      model: config.model,
    });

    await this.tmux.createSession(sessionName, cmd, workspacePath);

    await this.waitForReady(sessionName, adapter);

    const agent: AgentHandle = {
      id,
      type,
      sessionName,
      workspacePath,
      persistent,
      status: "idle",
      createdAt: new Date(),
    };

    this.agents.set(id, agent);

    this.hookManager?.emit("afterSpawn", {
      agentId: id,
      agentType: type,
      workspacePath,
      timestamp: Date.now(),
    });

    return agent;
  }

  async send(id: string, prompt: string): Promise<AgentOutput> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);

    agent.status = "working";
    try {
      const beforeRaw = await this.tmux.capturePane(agent.sessionName);

      const formatted = adapter.formatPrompt(prompt);
      await this.tmux.sendKeys(agent.sessionName, formatted);

      // Wait for response to stream in and stabilize
      const raw = await this.waitForResponse(agent.sessionName, beforeRaw, adapter);

      const output = adapter.parseOutput(raw);

      this.hookManager?.emit("afterSend", {
        agentId: id,
        agentType: agent.type,
        workspacePath: agent.workspacePath,
        timestamp: Date.now(),
        prompt,
        output: output.text,
      });

      return output;
    } finally {
      agent.status = "idle";
    }
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
    await copySkills([skillPath], join(agent.workspacePath, "skills"));
  }

  async kill(id: string): Promise<void> {
    const agent = this.getAgent(id);
    const adapter = this.getAdapter(agent.type);

    await this.hookManager?.emit("beforeKill", {
      agentId: id,
      agentType: agent.type,
      workspacePath: agent.workspacePath,
      timestamp: Date.now(),
    });

    await this.tmux.killSession(agent.sessionName);
    if (!agent.persistent) {
      await adapter.cleanup(agent.workspacePath);
    }
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

  private async waitForResponse(
    session: string,
    beforeContent: string,
    adapter: AgentAdapter,
    stableMs: number = 2000,
    pollIntervalMs: number = 300,
  ): Promise<string> {
    const responseMarker = adapter.getResponseMarker?.();
    let lastOutput = beforeContent;
    let lastChangeTime = Date.now();
    let contentChanged = false;

    while (true) {
      await Bun.sleep(pollIntervalMs);
      const output = await this.tmux.capturePane(session);

      if (output !== lastOutput) {
        lastOutput = output;
        lastChangeTime = Date.now();
        if (output !== beforeContent) contentChanged = true;
      }

      if (!contentChanged) continue;

      const isStable = Date.now() - lastChangeTime > stableMs;
      const hasResponse = !responseMarker || output.includes(responseMarker);

      // Response complete when: marker present AND pane has stabilized
      if (hasResponse && isStable) return lastOutput;

      // Safety timeout (2 minutes)
      if (Date.now() - lastChangeTime > 120_000) return lastOutput;
    }
  }
}
