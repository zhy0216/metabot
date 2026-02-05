// src/ctl/types.ts
import type { ToolCall } from "../types";

export interface WorkspaceConfig {
  skills: string[];
  instructions?: string;
  env?: Record<string, string>;
}

export interface LaunchOptions {
  workspacePath: string;
  projectPath: string;
  model?: string;
}

export interface AgentOutput {
  text: string;
  toolCalls?: ToolCall[];
  error?: string;
}

export interface SpawnConfig {
  project: string;
  skills?: string[];
  instructions?: string;
  model?: string;
  env?: Record<string, string>;
}

export interface AgentHandle {
  id: string;
  type: string;
  sessionName: string;
  workspacePath: string;
  projectPath: string;
  status: "idle" | "working" | "dead";
  createdAt: Date;
}

export interface AgentAdapter {
  readonly type: string;
  prepareWorkspace(config: WorkspaceConfig): Promise<string>;
  buildLaunchCommand(opts: LaunchOptions): string[];
  formatPrompt(prompt: string): string;
  getReadyPattern(): RegExp;
  parseOutput(raw: string): AgentOutput;
  cleanup(workspacePath: string): Promise<void>;
}
