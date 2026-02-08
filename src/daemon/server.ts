import { join } from "node:path";
import { homedir } from "node:os";
import { TmuxDriver } from "../ctl/tmux";
import { AgentManager } from "../ctl/manager";
import { ClaudeCodeAdapter } from "../ctl/adapters/claude-code";
import { loadConfig, getConfig } from "../config";
import { TelegramChannel } from "../channels";
import type { SpawnConfig } from "../ctl/types";

const METABOT_DIR = join(homedir(), ".metabot");
export const SOCKET_PATH =
  process.env.METABOT_SOCKET ?? join(METABOT_DIR, "daemon.sock");
export const PID_PATH =
  process.env.METABOT_PID ?? join(METABOT_DIR, "daemon.pid");

const startTime = Date.now();

const tmux = new TmuxDriver();
const manager = new AgentManager(tmux);
manager.registerAdapter(new ClaudeCodeAdapter());

function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function cleanup() {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(SOCKET_PATH).catch(() => {});
    await unlink(PID_PATH).catch(() => {});
  } catch {
    // best-effort
  }
}

async function gracefulShutdown() {
  for (const a of manager.list()) {
    try {
      await manager.kill(a.id);
    } catch {}
  }
  await cleanup();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

async function start() {
  const { mkdir, writeFile, unlink } = await import("node:fs/promises");

  await mkdir(METABOT_DIR, { recursive: true });
  await unlink(SOCKET_PATH).catch(() => {});
  await writeFile(PID_PATH, String(process.pid));

  const server = Bun.serve({
    unix: SOCKET_PATH,

    routes: {
      "/health": {
        GET: () =>
          Response.json({
            status: "ok",
            pid: process.pid,
            uptime: Math.round((Date.now() - startTime) / 1000),
          }),
      },

      "/agents": {
        GET: () => Response.json(manager.list()),
        POST: async (req) => {
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
          return Response.json(agent);
        },
      },

      "/agents/:id/status": {
        GET: (req) =>
          Response.json({ status: manager.getStatus(req.params.id) }),
      },

      "/agents/:id/output": {
        GET: async (req) => {
          const output = await manager.getOutput(req.params.id);
          return Response.json({ output });
        },
      },

      "/agents/:id/attach": {
        GET: (req) =>
          Response.json({ command: manager.getAttachCommand(req.params.id) }),
      },

      "/agents/:id/send": {
        POST: async (req) => {
          const b = await body(req);
          const prompt = b.prompt as string;
          if (!prompt) return err("Missing 'prompt' field");
          if (b.async === true) {
            await manager.sendAsync(req.params.id, prompt);
            return Response.json({ sent: true });
          }
          const result = await manager.send(req.params.id, prompt);
          return Response.json(result);
        },
      },

      "/agents/:id/skill": {
        POST: async (req) => {
          const b = await body(req);
          const skillPath = b.skillPath as string;
          if (!skillPath) return err("Missing 'skillPath' field");
          await manager.loadSkill(req.params.id, skillPath);
          return Response.json({ loaded: true });
        },
      },

      "/agents/:id": {
        DELETE: async (req) => {
          await manager.kill(req.params.id);
          return Response.json({ killed: true });
        },
      },

      "/shutdown": {
        POST: async () => {
          for (const a of manager.list()) {
            try {
              await manager.kill(a.id);
            } catch {
              // best-effort
            }
          }
          setTimeout(() => cleanup().then(() => process.exit(0)), 100);
          return Response.json({ status: "shutting_down" });
        },
      },
    },

    fetch(req) {
      return err("Not found", 404);
    },

    error(e) {
      return err(e instanceof Error ? e.message : String(e), 500);
    },
  });

  console.log(`metabot daemon started (pid ${process.pid})`);
  console.log(`socket: ${SOCKET_PATH}`);

  // Start configured channels in the same process
  await startChannels();

  return server;
}

async function startChannels() {
  try {
    await loadConfig();
    const config = getConfig();

    if (config.channels?.telegram?.botToken) {
      console.log("Starting Telegram channel...");
      const tg = new TelegramChannel({ name: "telegram" });
      tg.start().catch((err) => {
        console.error("Telegram channel error:", err.message);
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to start channels:", msg);
  }
}

start().catch((e) => {
  console.error("Failed to start daemon:", e.message);
  process.exit(1);
});
