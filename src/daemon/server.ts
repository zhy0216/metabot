// src/daemon/server.ts — Daemon entry point
// Runs a single long-lived process that owns the AgentManager singleton.
// Listens on a Unix domain socket for REST-style requests from CLI clients.

import { join } from "node:path";
import { homedir } from "node:os";
import { TmuxDriver } from "../ctl/tmux";
import { AgentManager } from "../ctl/manager";
import { ClaudeCodeAdapter } from "../ctl/adapters/claude-code";
import type { SpawnConfig } from "../ctl/types";

const METABOT_DIR = join(homedir(), ".metabot");
export const SOCKET_PATH =
  process.env.METABOT_SOCKET ?? join(METABOT_DIR, "daemon.sock");
export const PID_PATH =
  process.env.METABOT_PID ?? join(METABOT_DIR, "daemon.pid");

const startTime = Date.now();

// --- Singleton AgentManager ---
const tmux = new TmuxDriver();
const manager = new AgentManager(tmux);
manager.registerAdapter(new ClaudeCodeAdapter());

// --- Helpers ---

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function agentIdFromPath(path: string): string | null {
  // Match /agents/:id or /agents/:id/action
  const m = path.match(/^\/agents\/([^/]+)/);
  return m?.[1] ?? null;
}

// --- Route handler ---

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const method = req.method;

  try {
    // GET /health
    if (method === "GET" && path === "/health") {
      return json({
        status: "ok",
        pid: process.pid,
        uptime: Math.round((Date.now() - startTime) / 1000),
      });
    }

    // POST /agents — spawn
    if (method === "POST" && path === "/agents") {
      const b = await body(req);
      const type = b.type as string;
      if (!type) return err("Missing 'type' field");
      const config: SpawnConfig = {
        skills: b.skills as string[] | undefined,
        instructions: b.instructions as string | undefined,
        model: b.model as string | undefined,
        env: b.env as Record<string, string> | undefined,
        workspacePath: b.workspacePath as string | undefined,
      };
      const agent = await manager.spawn(type, config);
      return json(agent);
    }

    // GET /agents — list
    if (method === "GET" && path === "/agents") {
      return json(manager.list());
    }

    // Routes with :id
    const id = agentIdFromPath(path);
    if (id) {
      const subpath = path.slice(`/agents/${id}`.length);

      // GET /agents/:id/status
      if (method === "GET" && subpath === "/status") {
        return json({ status: manager.getStatus(id) });
      }

      // GET /agents/:id/output
      if (method === "GET" && subpath === "/output") {
        const output = await manager.getOutput(id);
        return json({ output });
      }

      // GET /agents/:id/attach
      if (method === "GET" && subpath === "/attach") {
        const command = manager.getAttachCommand(id);
        return json({ command });
      }

      // POST /agents/:id/send
      if (method === "POST" && subpath === "/send") {
        const b = await body(req);
        const prompt = b.prompt as string;
        if (!prompt) return err("Missing 'prompt' field");
        const async_ = b.async === true;
        if (async_) {
          await manager.sendAsync(id, prompt);
          return json({ sent: true });
        }
        const result = await manager.send(id, prompt);
        return json(result);
      }

      // POST /agents/:id/skill
      if (method === "POST" && subpath === "/skill") {
        const b = await body(req);
        const skillPath = b.skillPath as string;
        if (!skillPath) return err("Missing 'skillPath' field");
        await manager.loadSkill(id, skillPath);
        return json({ loaded: true });
      }

      // DELETE /agents/:id
      if (method === "DELETE" && (subpath === "" || subpath === "/")) {
        await manager.kill(id);
        return json({ killed: true });
      }
    }

    // POST /shutdown
    if (method === "POST" && path === "/shutdown") {
      // Graceful shutdown: kill all agents, then exit
      const agents = manager.list();
      for (const a of agents) {
        try {
          await manager.kill(a.id);
        } catch {
          // best-effort
        }
      }
      // Schedule exit after response is sent
      setTimeout(() => cleanup().then(() => process.exit(0)), 100);
      return json({ status: "shutting_down" });
    }

    return err("Not found", 404);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message, 500);
  }
}

// --- Cleanup ---

async function cleanup() {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(SOCKET_PATH).catch(() => {});
    await unlink(PID_PATH).catch(() => {});
  } catch {
    // best-effort
  }
}

// --- Signal handlers ---

process.on("SIGTERM", async () => {
  const agents = manager.list();
  for (const a of agents) {
    try {
      await manager.kill(a.id);
    } catch {}
  }
  await cleanup();
  process.exit(0);
});

process.on("SIGINT", async () => {
  const agents = manager.list();
  for (const a of agents) {
    try {
      await manager.kill(a.id);
    } catch {}
  }
  await cleanup();
  process.exit(0);
});

// --- Start server ---

async function start() {
  const { mkdir, writeFile, unlink } = await import("node:fs/promises");

  // Ensure directory exists
  await mkdir(METABOT_DIR, { recursive: true });

  // Remove stale socket if it exists
  await unlink(SOCKET_PATH).catch(() => {});

  // Write PID file
  await writeFile(PID_PATH, String(process.pid));

  const server = Bun.serve({
    unix: SOCKET_PATH,
    fetch: handleRequest,
  });

  console.log(`metabot daemon started (pid ${process.pid})`);
  console.log(`socket: ${SOCKET_PATH}`);

  return server;
}

// Run if executed directly
start().catch((e) => {
  console.error("Failed to start daemon:", e.message);
  process.exit(1);
});
