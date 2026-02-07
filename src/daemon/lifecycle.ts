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
 * Returns a DaemonClient connected to a running daemon.
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

export async function stopDaemon(): Promise<void> {
  const client = new DaemonClient(SOCKET_PATH);
  try {
    await client.shutdown();
  } catch {
  }
}

export async function startDaemon(): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(METABOT_DIR, { recursive: true });

  const serverScript = join(import.meta.dir, "server.ts");

  const proc = Bun.spawn(["bun", serverScript], {
    env: process.env as Record<string, string>,
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.unref();

  const client = new DaemonClient(SOCKET_PATH);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await Bun.sleep(POLL_INTERVAL_MS);
    try {
      await client.health();
      return;
    } catch {
    }
  }

  throw new Error(
    `Daemon failed to start within ${STARTUP_TIMEOUT_MS / 1000}s`,
  );
}

export async function cleanStaleFiles(): Promise<void> {
  const { readFile, unlink } = await import("node:fs/promises");

  let pidStr: string;
  try {
    pidStr = await readFile(PID_PATH, "utf-8");
  } catch {
    return;
  }

  const pid = parseInt(pidStr.trim(), 10);
  if (isNaN(pid)) {
    await unlink(PID_PATH).catch(() => {});
    await unlink(SOCKET_PATH).catch(() => {});
    return;
  }

  try {
    process.kill(pid, 0);
    return;
  } catch {
    await unlink(PID_PATH).catch(() => {});
    await unlink(SOCKET_PATH).catch(() => {});
  }
}
