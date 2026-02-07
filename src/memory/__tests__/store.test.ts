// src/memory/__tests__/store.test.ts
import { test, expect, beforeEach } from "bun:test";
import {
  readSessionMemory,
  writeSessionMemory,
  appendInteraction,
  listRecentSessions,
  formatDate,
  getMemoriesDir,
} from "../store";
import { rm, mkdir } from "node:fs/promises";

const memoriesDir = getMemoriesDir();

beforeEach(async () => {
  // Clean up and recreate memories dir
  try {
    await rm(memoriesDir, { recursive: true, force: true });
  } catch {}
  await mkdir(memoriesDir, { recursive: true });
});

test("formatDate formats timestamp as YYYYMMDD", () => {
  // 2026-02-07
  const ts = new Date(2026, 1, 7).getTime();
  expect(formatDate(ts)).toBe("20260207");
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

test("listRecentSessions returns files sorted by recency", async () => {
  await writeSessionMemory("aaa", "20260205", "old");
  await writeSessionMemory("bbb", "20260206", "mid");
  await writeSessionMemory("ccc", "20260207", "new");

  const files = await listRecentSessions(2);
  expect(files.length).toBe(2);
  // Reverse sorted — newest first
  expect(files[0]).toBe("ccc-20260207.md");
  expect(files[1]).toBe("bbb-20260206.md");
});

test("listRecentSessions returns empty array if dir missing", async () => {
  await rm(memoriesDir, { recursive: true, force: true });
  const files = await listRecentSessions();
  expect(files).toEqual([]);
});
