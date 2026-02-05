// src/ctl/adapters/claude-code.ts
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { AgentAdapter, WorkspaceConfig, LaunchOptions, AgentOutput } from "../types";
import { stripAnsi, createWorkspaceDir, copySkills } from "./base";

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly type = "claude-code";

  async prepareWorkspace(config: WorkspaceConfig): Promise<string> {
    const dir = await createWorkspaceDir("claude");

    // Copy skills
    if (config.skills.length > 0) {
      await copySkills(config.skills, join(dir, "skills"));
    }

    // Write CLAUDE.md instructions
    if (config.instructions) {
      await Bun.write(join(dir, "CLAUDE.md"), config.instructions);
    }

    return dir;
  }

  buildLaunchCommand(opts: LaunchOptions): string[] {
    const cmd = ["claude", "--dangerously-skip-permissions"];
    if (opts.model) {
      cmd.push("--model", opts.model);
    }
    // Last arg is the project directory
    cmd.push(opts.projectPath);
    return cmd;
  }

  formatPrompt(prompt: string): string {
    return prompt;
  }

  getReadyPattern(): RegExp {
    return />\s*$/m;
  }

  parseOutput(raw: string): AgentOutput {
    const clean = stripAnsi(raw);
    // Remove trailing prompt marker
    const text = clean.replace(/>\s*$/m, "").trim();
    return { text };
  }

  async cleanup(workspacePath: string): Promise<void> {
    await rm(workspacePath, { recursive: true, force: true });
  }
}
