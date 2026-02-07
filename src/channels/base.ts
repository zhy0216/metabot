import type { ChannelConfig, Channel } from "./types";
import type { DaemonClient } from "../daemon/client";
import type { AgentHandle } from "../ctl/types";
import { loadConfig, getConfig } from "../config";
import { ensureDaemon } from "../daemon/lifecycle";

export abstract class BaseChannel implements Channel {
  readonly name: string;
  protected config: ChannelConfig;
  protected client!: DaemonClient;
  protected agent!: AgentHandle;

  constructor(config: ChannelConfig) {
    this.name = config.name;
    this.config = config;
  }

  async start(): Promise<void> {
    await loadConfig();
    this.client = await ensureDaemon();
    this.agent = await this.resolveAgent();
    await this.run();
  }

  async stop(): Promise<void> {
    if (this.config.ownsAgent !== false) {
      try {
        await this.client.kill(this.agent.id);
      } catch {}
    }
  }

  protected abstract run(): Promise<void>;

  private async resolveAgent(): Promise<AgentHandle> {
    if (this.config.agentId) {
      const agents = await this.client.list();
      const existing = agents.find((a) => a.id === this.config.agentId);
      if (!existing) {
        throw new Error(`Agent ${this.config.agentId} not found`);
      }
      return existing;
    }

    const appConfig = getConfig();
    return this.client.spawn(this.config.agentType ?? "claude-code", {
      model: this.config.model ?? appConfig.agent.model,
      workspacePath: this.config.workspacePath ?? appConfig.workspace,
    });
  }
}
