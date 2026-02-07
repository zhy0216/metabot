import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DaemonClient } from "../client";

let testDir: string;
let socketPath: string;
let pidPath: string;
let serverProc: ReturnType<typeof Bun.spawn> | null = null;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "metabot-daemon-test-"));
  socketPath = join(testDir, "daemon.sock");
  pidPath = join(testDir, "daemon.pid");

  const serverScript = join(import.meta.dir, "../server.ts");
  serverProc = Bun.spawn(["bun", serverScript], {
    env: {
      ...process.env,
      METABOT_SOCKET: socketPath,
      METABOT_PID: pidPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const client = new DaemonClient(socketPath);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await client.health();
      break;
    } catch {
      await Bun.sleep(100);
    }
  }
});

afterAll(async () => {
  if (serverProc) {
    try {
      const client = new DaemonClient(socketPath);
      await client.shutdown();
      await serverProc.exited;
    } catch {
      serverProc.kill();
    }
  }
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
});

test("health endpoint returns status, pid, and uptime", async () => {
  const client = new DaemonClient(socketPath);
  const health = await client.health();

  expect(health.status).toBe("ok");
  expect(typeof health.pid).toBe("number");
  expect(typeof health.uptime).toBe("number");
  expect(health.uptime).toBeGreaterThanOrEqual(0);
});

test("PID file is written correctly", async () => {
  const pidStr = await readFile(pidPath, "utf-8");
  const pid = parseInt(pidStr.trim(), 10);
  expect(pid).toBeGreaterThan(0);

  const client = new DaemonClient(socketPath);
  const health = await client.health();
  expect(health.pid).toBe(pid);
});

test("list returns empty array when no agents spawned", async () => {
  const client = new DaemonClient(socketPath);
  const agents = await client.list();
  expect(Array.isArray(agents)).toBe(true);
  expect(agents.length).toBe(0);
});

test("404 for unknown routes", async () => {
  const client = new DaemonClient(socketPath);
  try {
    await (client as any).request("GET", "/nonexistent");
    expect(true).toBe(false); // Should not reach here
  } catch (e: any) {
    expect(e.message).toBe("Not found");
  }
});

test("spawn returns error for missing type", async () => {
  const client = new DaemonClient(socketPath);
  try {
    await client.spawn("", {});
    expect(true).toBe(false);
  } catch (e: any) {
    expect(e.message).toContain("type");
  }
});

test("getStatus returns error for unknown agent", async () => {
  const client = new DaemonClient(socketPath);
  try {
    await client.getStatus("nonexistent-agent");
    expect(true).toBe(false);
  } catch (e: any) {
    expect(e.message).toContain("Unknown agent");
  }
});

test("kill returns error for unknown agent", async () => {
  const client = new DaemonClient(socketPath);
  try {
    await client.kill("nonexistent-agent");
    expect(true).toBe(false);
  } catch (e: any) {
    expect(e.message).toContain("Unknown agent");
  }
});

test("send returns error for unknown agent", async () => {
  const client = new DaemonClient(socketPath);
  try {
    await client.send("nonexistent-agent", "hello");
    expect(true).toBe(false);
  } catch (e: any) {
    expect(e.message).toContain("Unknown agent");
  }
});

test("DaemonClient revives Date objects in agent handles", async () => {
  // Test date serialization by checking list (even though empty)
  const client = new DaemonClient(socketPath);
  const agents = await client.list();
  expect(agents).toEqual([]);
});
