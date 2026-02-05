# botctl

A lightweight TypeScript framework for orchestrating AI agents, built with Bun.

## Features

- **Multi-provider LLM support**: Anthropic, OpenAI, OpenRouter, Ollama
- **Tool system**: Extensible tools for file ops, shell commands, web access
- **Subagent spawning**: Delegate tasks to isolated subagents
- **Message bus**: Decoupled event-driven architecture
- **Multi-channel**: CLI (with Telegram/Discord ready to implement)
- **Session persistence**: JSONL-based conversation history
- **Skills system**: Markdown-based capability extensions

## Quick Start

```bash
# Install dependencies
bun install

# Set up workspace
bun run onboard

# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Start chatting
bun run chat
```

## Commands

```bash
bun run chat              # Interactive chat session
bun run chat -m "Hello"   # Single message
bun run gateway           # Start all configured channels
bun run onboard           # Set up workspace
bun run status            # Show configuration
```

## Architecture

```
src/
├── agent/          # Agent loop and subagent manager
├── bus/            # Message bus for event routing
├── channels/       # Channel implementations (CLI, etc.)
├── config/         # Configuration management
├── providers/      # LLM provider abstractions
├── session/        # Conversation history
├── skills/         # Skill loader
├── tools/          # Tool system
├── types/          # TypeScript type definitions
└── cli/            # CLI interface
```

## Core Concepts

### Agent Loop
The main agent receives messages, builds context, calls the LLM, executes tools in a loop until a final response is generated.

### Subagents
Spawn isolated agents for independent tasks. Subagents have limited tools (no user messaging, no spawning) and report results back through the message bus.

### Tools
Built-in tools:
- `read_file`, `write_file`, `edit_file`, `list_dir` - File operations
- `exec` - Shell command execution
- `spawn` - Subagent creation
- `message` - Send messages to channels

### Skills
Markdown files in `~/.botctl/skills/{name}/SKILL.md` that extend agent capabilities. Skills can specify requirements and be always-on or on-demand.

## Configuration

Config is stored at `~/.botctl/config.json`. Environment variables are auto-loaded:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`

## Development

```bash
# Run with hot reload
bun run dev

# Type check
bun run typecheck

# Run tests
bun test
```

## License

MIT
