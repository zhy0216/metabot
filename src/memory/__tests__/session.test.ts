// src/memory/__tests__/session.test.ts
import { test, expect, beforeEach } from "bun:test";
import { getOrCreateSession, updateLastResponseTime, clearSession } from "../session";
import { join } from "node:path";
import { homedir } from "node:os";
import { rm } from "node:fs/promises";

const sessionsPath = join(homedir(), ".metabot", "sessions.json");

beforeEach(async () => {
  // Clean up sessions file before each test
  try {
    await rm(sessionsPath, { force: true });
  } catch {}
});

test("getOrCreateSession creates new session when none exists", async () => {
  const result = await getOrCreateSession("test-agent-1");
  expect(result.isNew).toBe(true);
  expect(result.sessionId).toBeTruthy();
  expect(result.sessionId.length).toBe(8);
});

test("getOrCreateSession returns same session within timeout", async () => {
  const now = Date.now();
  const first = await getOrCreateSession("test-agent-2", now);
  expect(first.isNew).toBe(true);

  // 10 minutes later — still same session
  const second = await getOrCreateSession("test-agent-2", now + 10 * 60 * 1000);
  expect(second.isNew).toBe(false);
  expect(second.sessionId).toBe(first.sessionId);
});

test("getOrCreateSession creates new session after timeout", async () => {
  const now = Date.now();
  const first = await getOrCreateSession("test-agent-3", now);

  // 31 minutes later — new session
  const second = await getOrCreateSession("test-agent-3", now + 31 * 60 * 1000);
  expect(second.isNew).toBe(true);
  expect(second.sessionId).not.toBe(first.sessionId);
});

test("updateLastResponseTime extends session window", async () => {
  const now = Date.now();
  const first = await getOrCreateSession("test-agent-4", now);

  // Update response time at +20min
  await updateLastResponseTime("test-agent-4", now + 20 * 60 * 1000);

  // Check at +45min from original (but only 25min from last response)
  const second = await getOrCreateSession("test-agent-4", now + 45 * 60 * 1000);
  expect(second.isNew).toBe(false);
  expect(second.sessionId).toBe(first.sessionId);
});

test("clearSession removes session state", async () => {
  await getOrCreateSession("test-agent-5");
  await clearSession("test-agent-5");

  const result = await getOrCreateSession("test-agent-5");
  expect(result.isNew).toBe(true);
});

test("different agents have independent sessions", async () => {
  const now = Date.now();
  const a = await getOrCreateSession("agent-a", now);
  const b = await getOrCreateSession("agent-b", now);

  expect(a.sessionId).not.toBe(b.sessionId);
});
