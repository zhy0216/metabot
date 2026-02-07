import { join } from "node:path";
import { homedir } from "node:os";
import { readdir } from "node:fs/promises";

export interface Interaction {
  time: string; // HH:MM
  prompt: string;
  summary: string;
}

export function getMemoriesDir(): string {
  return join(homedir(), ".metabot", "workspace", "memories");
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function getSessionFilePath(sessionId: string, date: string): string {
  return join(getMemoriesDir(), `${date}-${sessionId}.md`);
}

export async function readSessionMemory(
  sessionId: string,
  date: string,
): Promise<string> {
  const path = getSessionFilePath(sessionId, date);
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
  } catch {
  }
  return "";
}

export async function writeSessionMemory(
  sessionId: string,
  date: string,
  content: string,
): Promise<void> {
  const path = getSessionFilePath(sessionId, date);
  await Bun.write(path, content);
}

export async function appendInteraction(
  sessionId: string,
  timestamp: number,
  interaction: Interaction,
): Promise<void> {
  const date = formatDate(timestamp);
  const existing = await readSessionMemory(sessionId, date);

  if (!existing) {
    const d = new Date(timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const content = `# Session ${sessionId} — ${dateStr}

## Interactions
### ${interaction.time}
**Prompt:** ${interaction.prompt}
**Summary:** ${interaction.summary}

## Key Decisions

## Lessons Learned
`;
    await writeSessionMemory(sessionId, date, content);
    return;
  }

  const marker = "## Key Decisions";
  const idx = existing.indexOf(marker);
  if (idx === -1) {
    const entry = `
### ${interaction.time}
**Prompt:** ${interaction.prompt}
**Summary:** ${interaction.summary}
`;
    await writeSessionMemory(sessionId, date, existing + entry);
    return;
  }

  const before = existing.slice(0, idx);
  const after = existing.slice(idx);
  const entry = `### ${interaction.time}
**Prompt:** ${interaction.prompt}
**Summary:** ${interaction.summary}

`;
  await writeSessionMemory(sessionId, date, before + entry + after);
}

export async function listRecentSessions(limit: number = 10): Promise<string[]> {
  const dir = getMemoriesDir();
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function loadRecentMemories(limit: number = 5): Promise<string> {
  const files = await listRecentSessions(limit);
  const dir = getMemoriesDir();
  const parts: string[] = [];

  for (const file of files) {
    try {
      const content = await Bun.file(join(dir, file)).text();
      parts.push(content);
    } catch {
    }
  }

  return parts.join("\n---\n\n");
}
