// src/ctl/adapters/claude-code.ts
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type {
  AgentAdapter,
  WorkspaceConfig,
  LaunchOptions,
  AgentOutput,
  SummarizeContext,
} from "../types";
import { stripAnsi, createWorkspaceDir, copySkills } from "./base";

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly type = "claude-code";

  async prepareWorkspace(config: WorkspaceConfig): Promise<string> {
    const dir = await createWorkspaceDir("claude");

    // Copy skills
    if (config.skills && config.skills.length > 0) {
      await copySkills(config.skills, join(dir, "skills"));
    }

    // Write CLAUDE.md instructions
    if (config.instructions) {
      await Bun.write(join(dir, "CLAUDE.md"), config.instructions);
    }

    // Write .claude/settings.json for mcps, tools, and plugins
    if (config.mcps || config.tools || config.plugins) {
      const settingsDir = join(dir, ".claude");
      await Bun.write(
        join(settingsDir, "settings.json"),
        JSON.stringify({
          ...(config.mcps && { mcpServers: config.mcps }),
          ...(config.tools && { allowedTools: config.tools }),
          ...(config.plugins && { plugins: config.plugins }),
        }, null, 2)
      );
    }

    return dir;
  }

  buildLaunchCommand(opts: LaunchOptions): string[] {
    const cmd = ["claude", "--dangerously-skip-permissions"];
    if (opts.model) {
      cmd.push("--model", opts.model);
    }
    // Last arg is the workspace directory
    cmd.push(opts.workspacePath);
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

  async summarizeMemory(ctx: SummarizeContext): Promise<string> {
    const systemPrompt = [
      "You are a memory summarizer for an AI agent.",
      "Given a user prompt and agent output from a conversation turn,",
      "update the session memory file.",
      "",
      "Rules:",
      "- Add a new entry under ## Interactions with time, prompt summary, and output summary",
      "- Update ## Key Decisions if any architectural or tool choices were made",
      "- Update ## Lessons Learned if any reusable insights emerged",
      "- Keep entries concise (1-2 sentences each)",
      "- Preserve all existing content, only append/update",
      "- Output the complete updated memory file content",
    ].join("\n");

    const userPrompt = [
      "## Current session memory file:",
      ctx.existingMemory || "(empty — create new file)",
      "",
      "## This turn:",
      `**User prompt:** ${ctx.prompt}`,
      "",
      `**Agent output:** ${ctx.output.slice(0, 4000)}`,
      "",
      "Output the updated memory file:",
    ].join("\n");

    const proc = Bun.spawn(
      ["claude", "--print", "--model", "claude-haiku-4-5-20251001", "-p", userPrompt, "--system-prompt", systemPrompt],
      { stdout: "pipe", stderr: "pipe" },
    );

    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`summarizer failed (exit ${exitCode}): ${stderr}`);
    }

    return text.trim();
  }
}
