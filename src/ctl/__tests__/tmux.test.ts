// src/ctl/__tests__/tmux.test.ts
import { test, expect, afterEach } from "bun:test";
import { TmuxDriver } from "../tmux";

const tmux = new TmuxDriver();
const testSession = `botctl-test-${Date.now()}`;

afterEach(async () => {
  try {
    await tmux.killSession(testSession);
  } catch {}
});

test("createSession starts a detached tmux session", async () => {
  await tmux.createSession(testSession, ["bash"], "/tmp");
  const exists = await tmux.sessionExists(testSession);
  expect(exists).toBe(true);
});

test("sessionExists returns false for nonexistent session", async () => {
  const exists = await tmux.sessionExists("botctl-nonexistent-session");
  expect(exists).toBe(false);
});

test("sendKeys and capturePane round-trip", async () => {
  await tmux.createSession(testSession, ["bash"], "/tmp");
  await Bun.sleep(500);
  await tmux.sendKeys(testSession, "echo HELLO_BOTCTL");
  await Bun.sleep(500);
  const output = await tmux.capturePane(testSession);
  expect(output).toContain("HELLO_BOTCTL");
});

test("killSession removes the session", async () => {
  await tmux.createSession(testSession, ["bash"], "/tmp");
  await tmux.killSession(testSession);
  const exists = await tmux.sessionExists(testSession);
  expect(exists).toBe(false);
});
