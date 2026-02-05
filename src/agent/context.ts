import { join } from "path";
import type { LLMMessage, Message } from "../types";
import { getConfig } from "../config";
import { skillsLoader } from "../skills";

export async function buildSystemPrompt(): Promise<string> {
  const config = getConfig();
  const sections: string[] = [];

  // Load workspace files
  const workspaceFiles = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];

  for (const filename of workspaceFiles) {
    const path = join(config.workspace, filename);
    const file = Bun.file(path);

    if (await file.exists()) {
      const content = await file.text();
      sections.push(`# ${filename.replace(".md", "")}\n\n${content}`);
    }
  }

  // Load memory context
  const memoryPath = join(config.workspace, "memory", "MEMORY.md");
  const memoryFile = Bun.file(memoryPath);
  if (await memoryFile.exists()) {
    const memory = await memoryFile.text();
    if (memory.trim()) {
      sections.push(`# Memory\n\n${memory}`);
    }
  }

  // Load skills context
  await skillsLoader.load();
  const skillsContext = skillsLoader.buildContext();
  if (skillsContext.trim()) {
    sections.push(`# Skills\n\n${skillsContext}`);
  }

  // Add base instructions if no workspace files exist
  if (sections.length === 0) {
    sections.push(`# Instructions

You are a helpful AI assistant with access to various tools. Use them to help the user accomplish their tasks.

## Guidelines
- Be concise and direct in your responses
- Use tools when needed to accomplish tasks
- If a task requires multiple steps, break it down and execute each step
- If you encounter an error, explain what happened and suggest solutions
- You can spawn subagents for complex, independent tasks`);
  }

  return sections.join("\n\n---\n\n");
}

export function buildMessages(history: Message[]): LLMMessage[] {
  return history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

export async function buildContext(
  history: Message[],
  currentMessage: string
): Promise<{ systemPrompt: string; messages: LLMMessage[] }> {
  const systemPrompt = await buildSystemPrompt();
  const messages = buildMessages(history);

  // Add current user message
  messages.push({
    role: "user",
    content: currentMessage,
  });

  return { systemPrompt, messages };
}
