// src/memory/session.ts

import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface SessionEntry {
  sessionId: string;
  agentId: string;
  lastResponseTime: number;
  createdAt: number;
}

export interface SessionsState {
  active: Record<string, SessionEntry>; // keyed by agentId
}

function getSessionsPath(): string {
  return join(homedir(), ".metabot", "sessions.json");
}

async function loadSessions(): Promise<SessionsState> {
  try {
    const file = Bun.file(getSessionsPath());
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // ignore
  }
  return { active: {} };
}

async function saveSessions(state: SessionsState): Promise<void> {
  await Bun.write(getSessionsPath(), JSON.stringify(state, null, 2));
}

function generateSessionId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export async function getOrCreateSession(
  agentId: string,
  now: number = Date.now(),
): Promise<{ sessionId: string; isNew: boolean }> {
  const state = await loadSessions();
  const existing = state.active[agentId];

  if (existing && (now - existing.lastResponseTime) <= SESSION_TIMEOUT_MS) {
    return { sessionId: existing.sessionId, isNew: false };
  }

  // New session
  const sessionId = generateSessionId();
  state.active[agentId] = {
    sessionId,
    agentId,
    lastResponseTime: now,
    createdAt: now,
  };
  await saveSessions(state);
  return { sessionId, isNew: true };
}

export async function updateLastResponseTime(
  agentId: string,
  time: number = Date.now(),
): Promise<void> {
  const state = await loadSessions();
  const entry = state.active[agentId];
  if (entry) {
    entry.lastResponseTime = time;
    await saveSessions(state);
  }
}

export async function clearSession(agentId: string): Promise<void> {
  const state = await loadSessions();
  delete state.active[agentId];
  await saveSessions(state);
}
