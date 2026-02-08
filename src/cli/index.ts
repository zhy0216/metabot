#!/usr/bin/env bun

import { runChat, runGateway, runOnboard, runStatus, runTelegram } from "./commands";
import { runSpawn } from "./commands/spawn";
import { runSend } from "./commands/send";
import { runOutput } from "./commands/output";
import { runList } from "./commands/list";
import { runKill } from "./commands/kill";
import { runAttach } from "./commands/attach";
import { runSkill } from "./commands/skill";
import {
  startDaemon,
  stopDaemon,
  daemonStatus,
} from "../daemon/lifecycle";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "chat":
      const msgIndex = args.indexOf("-m");
      if (msgIndex !== -1 && args[msgIndex + 1]) {
        await runChat(args[msgIndex + 1]);
      } else {
        await runChat();
      }
      break;

    case "gateway":
      await runGateway();
      break;

    case "telegram":
      await runTelegram();
      break;

    case "onboard":
    case "init":
      await runOnboard();
      break;

    case "status":
      await runStatus();
      break;

    case "spawn":
      await runSpawn(args.slice(1));
      break;

    case "send":
      await runSend(args.slice(1));
      break;

    case "output":
      await runOutput(args.slice(1));
      break;

    case "list":
      await runList();
      break;

    case "kill":
      await runKill(args.slice(1));
      break;

    case "attach":
      await runAttach(args.slice(1));
      break;

    case "skill":
      await runSkill(args.slice(1));
      break;

    case "daemon":
      await runDaemon(args.slice(1));
      break;

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}\n`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

async function runDaemon(subargs: string[]) {
  const sub = subargs[0];
  switch (sub) {
    case "start": {
      const status = await daemonStatus();
      if (status.running) {
        console.log(`Daemon already running (pid ${status.pid})`);
        return;
      }
      await startDaemon();
      const s = await daemonStatus();
      console.log(`Daemon started (pid ${s.pid})`);
      break;
    }
    case "stop":
      await stopDaemon();
      console.log("Daemon stopped");
      break;
    case "status": {
      const status = await daemonStatus();
      if (status.running) {
        console.log(`Daemon running (pid ${status.pid}, uptime ${status.uptime}s)`);
      } else {
        console.log("Daemon not running");
      }
      break;
    }
    default:
      console.error("Usage: botctl daemon <start|stop|status>");
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
botctl - Bot controller CLI

Usage:
  botctl <command> [options]

Commands:
  chat              Start interactive chat session
  chat -m "msg"     Send a single message
  spawn             Spawn an agent in tmux
  send              Send a prompt to an agent
  output            Show terminal output from an agent
  list              Show all running agents
  kill              Terminate an agent
  attach            Attach to agent's tmux session
  skill             Hot-load a skill into an agent
  daemon            Manage the background daemon
  telegram          Start Telegram bot channel
  gateway           Start all configured channels
  onboard           Set up workspace and config
  status            Show configuration status
  help              Show this help message

Daemon:
  daemon start      Start the daemon process
  daemon stop       Stop the daemon process
  daemon status     Show daemon status

Environment:
  ANTHROPIC_API_KEY   Anthropic API key
  OPENAI_API_KEY      OpenAI API key
  OPENROUTER_API_KEY  OpenRouter API key

Examples:
  botctl onboard                    # First-time setup
  botctl chat                       # Interactive mode
  botctl chat -m "Hello"            # Single message
  botctl spawn claude-code --project ./myapp  # Spawn agent
  botctl send <agent-id> "Build a todo app"   # Send prompt to agent
  botctl send --async <agent-id> "Task"       # Send without waiting
  botctl output <agent-id>                    # View agent output
  botctl list                                 # List all running agents
  botctl kill <agent-id>                      # Kill an agent
  botctl attach <agent-id>                    # Attach to agent session
  botctl skill <agent-id> ./skill.md          # Load skill into agent
  botctl daemon status                        # Check daemon status
  botctl telegram                   # Start Telegram bot
  botctl gateway                    # Run with all channels
`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
