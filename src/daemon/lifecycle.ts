// src/daemon/lifecycle.ts — Daemon lifecycle management
// Provides ensureDaemon(), the single entry point CLI commands use to get a ready DaemonClient.

import { join } from "node:path";
import { homedir } from "node:os";
import { DaemonClient } from "./client";

const METABOT_DIR = join(homedir(), ".metabot");
const SOCKET_PATH =
  process.env.METABOT_SOCKET ?? join(METABOT_DIR, "daemon.sock");
const PID_PATH =
  process.env.METABOT_PID ?? join(METABOT_DIR, "daemon.pid");

const STARTUP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 150;

/**
 * Main entry point. Returns a DaemonClient connected to a running daemon.
 * Auto-starts the daemon if it's not already running.
 */
export async function ensureDaemon(): Promise<DaemonClient> {
  const client = new DaemonClient(SOCKET_PATH);

  if (await isDaemonRunning(client)) {
    return client;
  }

  // Not running — clean stale files and start fresh
  await cleanStaleFiles();
  await startDaemon();
  return client;
}

/**
 * Checks if the daemon is reachable via its health endpoint.
 */
export async function isDaemonRunning(
  client?: DaemonClient,
): Promise<boolean> {
  const c = client ?? new DaemonClient(SOCKET_PATH);
  try {
    await c.health();
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns daemon status info.
 */
export async function daemonStatus(): Promise<{
  running: boolean;
  pid?: number;
  uptime?: number;
}> {
  const client = new DaemonClient(SOCKET_PATH);
  try {
    const h = await client.health();
    return { running: true, pid: h.pid, uptime: h.uptime };
  } catch {
    return { running: false };
  }
}

/**
 * Sends a shutdown request to the daemon.
 */
export async function stopDaemon(): Promise<void> {
  const client = new DaemonClient(SOCKET_PATH);
  try {
    await client.shutdown();
  } catch {
    // Already stopped or unreachable — that's fine
  }
}

/**
 * Spawns the daemon process detached, polls /health until ready.
 */
export async function startDaemon(): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(METABOT_DIR, { recursive: true });

  // Resolve the server script path relative to this file
  const serverScript = join(import.meta.dir, "server.ts");

  const env: Record<string, string> = { ...process.env } as Record<
    string,
    string
  >;
  if (process.env.METABOT_SOCKET) env.METABOT_SOCKET = process.env.METABOT_SOCKET;
  if (process.env.METABOT_PID) env.METABOT_PID = process.env.METABOT_PID;

  // Spawn detached process
  const proc = Bun.spawn(["bun", serverScript], {
    env,
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.unref();

  // Poll /health until ready
  const client = new DaemonClient(SOCKET_PATH);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await Bun.sleep(POLL_INTERVAL_MS);
    try {
      await client.health();
      return; // Daemon is up
    } catch {
      // Not ready yet
    }
  }

  throw new Error(
    `Daemon failed to start within ${STARTUP_TIMEOUT_MS / 1000}s`,
  );
}

/**
 * Removes stale .sock and .pid files if the PID is no longer alive.
 */
export async function cleanStaleFiles(): Promise<void> {
  const { readFile, unlink } = await import("node:fs/promises");

  let pidStr: string;
  try {
    pidStr = await readFile(PID_PATH, "utf-8");
  } catch {
    // No PID file — nothing stale
    return;
  }

  const pid = parseInt(pidStr.trim(), 10);
  if (isNaN(pid)) {
    // Corrupt PID file — remove both
    await unlink(PID_PATH).catch(() => {});
    await unlink(SOCKET_PATH).catch(() => {});
    return;
  }

  // Check if process is alive
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    // Process is alive — daemon is actually running, don't clean
    return;
  } catch {
    // Process dead — clean up stale files
    await unlink(PID_PATH).catch(() => {});
    await unlink(SOCKET_PATH).catch(() => {});
  }
}
