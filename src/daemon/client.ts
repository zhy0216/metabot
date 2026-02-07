import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentHandle, AgentOutput, SpawnConfig } from "../ctl/types";

const METABOT_DIR = join(homedir(), ".metabot");
export const SOCKET_PATH =
  process.env.METABOT_SOCKET ?? join(METABOT_DIR, "daemon.sock");

function reviveAgent(data: Record<string, unknown>): AgentHandle {
  return {
    ...data,
    createdAt: new Date(data.createdAt as string),
  } as AgentHandle;
}

export class DaemonClient {
  private socketPath: string;

  constructor(socketPath: string = SOCKET_PATH) {
    this.socketPath = socketPath;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const opts: RequestInit = { method };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`http://localhost${path}`, {
      ...opts,
      unix: this.socketPath,
    } as RequestInit);

    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        (data as Record<string, string>).error ?? `HTTP ${res.status}`,
      );
    }
    return data;
  }

  async health(): Promise<{ status: string; pid: number; uptime: number }> {
    return (await this.request("GET", "/health")) as {
      status: string;
      pid: number;
      uptime: number;
    };
  }

  async spawn(type: string, config: SpawnConfig): Promise<AgentHandle> {
    const data = await this.request("POST", "/agents", { type, ...config });
    return reviveAgent(data as Record<string, unknown>);
  }

  async list(): Promise<AgentHandle[]> {
    const data = (await this.request("GET", "/agents")) as Record<
      string,
      unknown
    >[];
    return data.map(reviveAgent);
  }

  async getStatus(id: string): Promise<AgentHandle["status"]> {
    const data = (await this.request(
      "GET",
      `/agents/${id}/status`,
    )) as Record<string, string>;
    return data.status as AgentHandle["status"];
  }

  async getOutput(id: string): Promise<string> {
    const data = (await this.request(
      "GET",
      `/agents/${id}/output`,
    )) as { output: string };
    return data.output;
  }

  async getAttachCommand(id: string): Promise<string> {
    const data = (await this.request(
      "GET",
      `/agents/${id}/attach`,
    )) as { command: string };
    return data.command;
  }

  async send(id: string, prompt: string): Promise<AgentOutput> {
    return (await this.request("POST", `/agents/${id}/send`, {
      prompt,
    })) as AgentOutput;
  }

  async sendAsync(id: string, prompt: string): Promise<void> {
    await this.request("POST", `/agents/${id}/send`, {
      prompt,
      async: true,
    });
  }

  async loadSkill(id: string, skillPath: string): Promise<void> {
    await this.request("POST", `/agents/${id}/skill`, { skillPath });
  }

  async kill(id: string): Promise<void> {
    await this.request("DELETE", `/agents/${id}`);
  }

  async shutdown(): Promise<void> {
    await this.request("POST", "/shutdown");
  }
}
