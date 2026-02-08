import { test, expect, beforeEach } from "bun:test";
import {
  readSessionMemory,
  writeSessionMemory,
  appendInteraction,
  appendChatLog,
  listRecentSessions,
  loadRecentMemories,
  formatDate,
  getSessionsDir,
  getSessionDir,
} from "../store";
import { join } from "node:path";
import { rm, mkdir } from "node:fs/promises";

const sessionsDir = getSessionsDir();

beforeEach(async () => {
  try {
    await rm(sessionsDir, { recursive: true, force: true });
  } catch {}
  await mkdir(sessionsDir, { recursive: true });
});

test("formatDate formats timestamp as YYYYMMDD", () => {
  // 2026-02-07
  const ts = new Date(2026, 1, 7).getTime();
  expect(formatDate(ts)).toBe("20260207");
});

test("getSessionDir returns directory path", () => {
  const dir = getSessionDir("abc123", "20260207");
  expect(dir).toBe(join(sessionsDir, "20260207-abc123"));
});

test("readSessionMemory returns empty string for nonexistent file", async () => {
  const result = await readSessionMemory("nonexistent", "20260207");
  expect(result).toBe("");
});

test("writeSessionMemory and readSessionMemory round-trip", async () => {
  const content = "# Session test123\n\nHello world";
  await writeSessionMemory("test123", "20260207", content);
  const result = await readSessionMemory("test123", "20260207");
  expect(result).toBe(content);
});

test("writeSessionMemory creates session directory", async () => {
  await writeSessionMemory("newsess", "20260207", "test content");
  const dir = getSessionDir("newsess", "20260207");
  const file = Bun.file(join(dir, "memory.md"));
  expect(await file.exists()).toBe(true);
});

test("appendInteraction creates new file if none exists", async () => {
  const ts = new Date(2026, 1, 7, 14, 30).getTime();
  await appendInteraction("newsess", ts, {
    time: "14:30",
    prompt: "build a todo app",
    summary: "Created basic todo app with React",
  });

  const content = await readSessionMemory("newsess", "20260207");
  expect(content).toContain("# Session newsess");
  expect(content).toContain("### 14:30");
  expect(content).toContain("build a todo app");
  expect(content).toContain("Created basic todo app");
  expect(content).toContain("## Key Decisions");
  expect(content).toContain("## Lessons Learned");
});

test("appendInteraction appends to existing file", async () => {
  const ts1 = new Date(2026, 1, 7, 14, 0).getTime();
  await appendInteraction("appsess", ts1, {
    time: "14:00",
    prompt: "first task",
    summary: "did first thing",
  });

  const ts2 = new Date(2026, 1, 7, 14, 15).getTime();
  await appendInteraction("appsess", ts2, {
    time: "14:15",
    prompt: "second task",
    summary: "did second thing",
  });

  const content = await readSessionMemory("appsess", "20260207");
  expect(content).toContain("### 14:00");
  expect(content).toContain("first task");
  expect(content).toContain("### 14:15");
  expect(content).toContain("second task");
});

test("appendChatLog creates chat.log with formatted entries", async () => {
  const ts = new Date(2026, 1, 7, 14, 30).getTime();
  await appendChatLog("chatsess", "20260207", "user", "what's the weather", ts);
  await appendChatLog("chatsess", "20260207", "assistant", "It's sunny and 72°F", ts);

  const dir = getSessionDir("chatsess", "20260207");
  const logContent = await Bun.file(join(dir, "chat.log")).text();
  expect(logContent).toContain("user: what's the weather");
  expect(logContent).toContain("assistant: It's sunny and 72°F");
  expect(logContent).toContain("[14:30]");
});

test("appendChatLog appends to existing log", async () => {
  const ts1 = new Date(2026, 1, 7, 14, 0).getTime();
  const ts2 = new Date(2026, 1, 7, 14, 15).getTime();
  await appendChatLog("chatsess2", "20260207", "user", "hello", ts1);
  await appendChatLog("chatsess2", "20260207", "assistant", "hi there", ts1);
  await appendChatLog("chatsess2", "20260207", "user", "how are you", ts2);

  const dir = getSessionDir("chatsess2", "20260207");
  const logContent = await Bun.file(join(dir, "chat.log")).text();
  const lines = logContent.trim().split("\n");
  expect(lines.length).toBe(3);
});

test("listRecentSessions returns directories sorted by recency", async () => {
  await writeSessionMemory("aaa", "20260205", "old");
  await writeSessionMemory("bbb", "20260206", "mid");
  await writeSessionMemory("ccc", "20260207", "new");

  const dirs = await listRecentSessions(2);
  expect(dirs.length).toBe(2);
  expect(dirs[0]).toBe("20260207-ccc");
  expect(dirs[1]).toBe("20260206-bbb");
});

test("listRecentSessions returns empty array if dir missing", async () => {
  await rm(sessionsDir, { recursive: true, force: true });
  const dirs = await listRecentSessions();
  expect(dirs).toEqual([]);
});

test("loadRecentMemories reads memory.md from session dirs", async () => {
  await writeSessionMemory("aaa", "20260205", "# Old session");
  await writeSessionMemory("bbb", "20260207", "# New session");

  const result = await loadRecentMemories(5);
  expect(result).toContain("# New session");
  expect(result).toContain("# Old session");
  expect(result).toContain("---");
});
