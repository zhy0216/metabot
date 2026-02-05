# botctl Examples

Usage examples demonstrating common agent patterns with botctl.

## Examples

### [plan-agent](./plan-agent/)
Demonstrates an orchestrator agent that breaks down tasks and delegates to worker agents. Shows multi-agent coordination patterns.

### [code-agent](./code-agent/)
Demonstrates a focused coding agent that implements features based on specifications. Shows single-agent task execution.

### [parallel-agents](./parallel-agents/)
Demonstrates spawning multiple specialized agents (frontend, backend, tests) to work on different parts of a project simultaneously.

## Running Examples

```bash
# Install dependencies first
bun install

# Run an example
bun run examples/plan-agent/index.ts
bun run examples/code-agent/index.ts
bun run examples/parallel-agents/index.ts
```

## Prerequisites

- [tmux](https://github.com/tmux/tmux) installed and available in PATH
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`)
- `ANTHROPIC_API_KEY` environment variable set
