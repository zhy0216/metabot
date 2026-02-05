#!/usr/bin/env bun

import { runChat, runGateway, runOnboard, runStatus } from "./commands";
import { runSpawn } from "./commands/spawn";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "chat":
      // Check for -m flag for single message
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

function printHelp() {
  console.log(`
botctl - Bot controller CLI

Usage:
  botctl <command> [options]

Commands:
  chat              Start interactive chat session
  chat -m "msg"     Send a single message
  spawn             Spawn an agent in tmux
  gateway           Start all configured channels
  onboard           Set up workspace and config
  status            Show configuration status
  help              Show this help message

Environment:
  ANTHROPIC_API_KEY   Anthropic API key
  OPENAI_API_KEY      OpenAI API key
  OPENROUTER_API_KEY  OpenRouter API key

Examples:
  botctl onboard                    # First-time setup
  botctl chat                       # Interactive mode
  botctl chat -m "Hello"            # Single message
  botctl spawn claude-code --project ./myapp  # Spawn agent
  botctl gateway                    # Run with all channels
`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
