# Parallel Agents Example

Demonstrates spawning multiple specialized agents to work on different parts of a project simultaneously.

## Pattern Overview

```
                ┌─────────────────┐
                │   Coordinator   │
                └────────┬────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Frontend   │ │   Backend    │ │    Tests     │
│    Agent     │ │    Agent     │ │    Agent     │
└──────────────┘ └──────────────┘ └──────────────┘
        │                │                │
        ▼                ▼                ▼
   components/       api/users.ts    tests/setup.ts
   Button.tsx
```

## Usage

```bash
bun run examples/parallel-agents/index.ts
```

## Key Concepts

### 1. Parallel Spawning
Spawn multiple agents at once:

```typescript
const [frontend, backend, tests] = await Promise.all([
  manager.spawn("claude-code", { project: dir, instructions: "Frontend specialist..." }),
  manager.spawn("claude-code", { project: dir, instructions: "Backend specialist..." }),
  manager.spawn("claude-code", { project: dir, instructions: "Testing specialist..." }),
]);
```

### 2. Async Task Dispatch
Send tasks without waiting for completion:

```typescript
// Fire tasks to all agents simultaneously
await Promise.all([
  manager.sendAsync(frontend.id, "Create the Button component..."),
  manager.sendAsync(backend.id, "Create the API routes..."),
  manager.sendAsync(tests.id, "Create test utilities..."),
]);
```

### 3. Status Polling
Check when agents complete:

```typescript
while (true) {
  const statuses = [
    manager.getStatus(frontend.id),
    manager.getStatus(backend.id),
    manager.getStatus(tests.id),
  ];

  if (statuses.every(s => s === "idle")) {
    console.log("All done!");
    break;
  }

  await Bun.sleep(2000);
}
```

### 4. Collecting Results
Get output from all agents:

```typescript
const results = await Promise.all([
  manager.getOutput(frontend.id),
  manager.getOutput(backend.id),
  manager.getOutput(tests.id),
]);
```

## When to Use Parallel Agents

**Good candidates:**
- Independent modules (frontend/backend/tests)
- Multiple microservices
- Documentation + Implementation
- Multi-language projects

**Avoid when:**
- Tasks have dependencies (use sequential or plan-agent pattern)
- Agents need to modify the same files
- Work requires coordination mid-task

## Resource Considerations

Each agent runs in its own tmux session and Claude Code process. Monitor system resources when spawning many agents:

```typescript
// List all running agents
const agents = manager.list();
console.log(`Active agents: ${agents.length}`);

// Cleanup when done
for (const agent of agents) {
  await manager.kill(agent.id);
}
```
