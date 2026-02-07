// src/ctl/types.ts
import type { ToolCall } from "../types";

export interface WorkspaceConfig {
  skills?: string[];
  mcps?: string[];
  tools?: string[];
  plugins?: string[];
  instructions?: string;
  env?: Record<string, string>;
}

export interface LaunchOptions {
  workspacePath: string;
  model?: string;
}

export interface AgentOutput {
  text: string;
  toolCalls?: ToolCall[];
  error?: string;
}

export interface SpawnConfig {
  skills?: string[];
  instructions?: string;
  model?: string;
  env?: Record<string, string>;
  workspacePath?: string;
}

export interface AgentHandle {
  id: string;
  type: string;
  sessionName: string;
  workspacePath: string;
  persistent: boolean;
  status: "idle" | "working" | "dead";
  createdAt: Date;
}

export interface SummarizeContext {
  prompt: string;
  output: string;
  existingMemory: string;
  sessionId: string;
}

export interface AgentAdapter {
  readonly type: string;
  prepareWorkspace(config: WorkspaceConfig): Promise<string>;
  buildLaunchCommand(opts: LaunchOptions): string[];
  formatPrompt(prompt: string): string;
  getReadyPattern(): RegExp;
  parseOutput(raw: string): AgentOutput;
  cleanup(workspacePath: string): Promise<void>;
  summarizeMemory(ctx: SummarizeContext): Promise<string>;
}
