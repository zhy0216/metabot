import { join } from "node:path";
import { homedir } from "node:os";
import { readdir, mkdir } from "node:fs/promises";

export interface Interaction {
  time: string; // HH:MM
  prompt: string;
  summary: string;
}

export function getSessionsDir(): string {
  return join(homedir(), ".metabot", "sessions");
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function getSessionDir(sessionId: string, date: string): string {
  return join(getSessionsDir(), `${date}-${sessionId}`);
}

function getSessionFilePath(sessionId: string, date: string): string {
  return join(getSessionDir(sessionId, date), "memory.md");
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
  const dir = getSessionDir(sessionId, date);
  await mkdir(dir, { recursive: true });
  const path = getSessionFilePath(sessionId, date);
  await Bun.write(path, content);
}

export async function appendChatLog(
  sessionId: string,
  date: string,
  role: string,
  content: string,
  timestamp: number,
): Promise<void> {
  const dir = getSessionDir(sessionId, date);
  await mkdir(dir, { recursive: true });
  const logPath = join(dir, "chat.log");
  const time = new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const line = `[${time}] ${role}: ${content}\n`;

  const file = Bun.file(logPath);
  let existing = "";
  try {
    if (await file.exists()) {
      existing = await file.text();
    }
  } catch {}
  await Bun.write(logPath, existing + line);
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
  const dir = getSessionsDir();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function loadRecentMemories(limit: number = 5): Promise<string> {
  const dirs = await listRecentSessions(limit);
  const baseDir = getSessionsDir();
  const parts: string[] = [];

  for (const dirName of dirs) {
    try {
      const memoryPath = join(baseDir, dirName, "memory.md");
      const content = await Bun.file(memoryPath).text();
      parts.push(content);
    } catch {
    }
  }

  return parts.join("\n---\n\n");
}
