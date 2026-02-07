export type HookEvent = "afterSend" | "afterSpawn" | "beforeKill";

export interface HookContext {
  agentId: string;
  agentType: string;
  workspacePath: string;
  timestamp: number;
  // afterSend specific
  prompt?: string;
  output?: string;
}

export interface Hook {
  name: string;
  event: HookEvent;
  handler: (ctx: HookContext) => Promise<void>;
}
