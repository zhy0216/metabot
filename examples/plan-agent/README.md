# Plan Agent Example

Demonstrates an orchestrator pattern where a planning agent breaks down tasks and delegates to worker agents.

## Pattern Overview

```
┌─────────────────┐
│   User Task     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Plan Agent     │  Breaks task into steps
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│Worker1│ │Worker2│  Execute steps in parallel
└───────┘ └───────┘
```

## Usage

```bash
bun run examples/plan-agent/index.ts
```

## Key Concepts

### 1. Planner Agent
The planner receives high-level tasks and outputs structured plans:

```typescript
const planner = await manager.spawn("claude-code", {
  project: process.cwd(),
  instructions: "You are a planning agent. Break tasks into steps...",
});

const plan = await manager.send(planner.id, "Plan: Build a todo app");
```

### 2. Worker Agents
Workers execute specific tasks from the plan:

```typescript
const worker = await manager.spawn("claude-code", {
  project: "./src",
  instructions: "You are an implementation agent. Complete tasks concisely.",
});

await manager.send(worker.id, "Create the User model with email and password fields");
```

### 3. Coordination
Manage dependencies by waiting for blocking tasks:

```typescript
// Execute independent tasks in parallel
const [result1, result2] = await Promise.all([
  manager.send(worker1.id, step1.task),
  manager.send(worker2.id, step2.task),
]);

// Sequential: step3 depends on step1 and step2
await manager.send(worker3.id, step3.task);
```

## Advanced: Async Execution

For long-running tasks, use async sends:

```typescript
// Fire and forget
await manager.sendAsync(worker.id, "Run the full test suite");

// Check status later
const status = manager.getStatus(worker.id); // "idle" | "working" | "dead"

// Get output when ready
if (status === "idle") {
  const output = await manager.getOutput(worker.id);
  console.log(output);
}
```
