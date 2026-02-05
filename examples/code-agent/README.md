# Code Agent Example

Demonstrates a focused coding agent that implements features step-by-step from specifications.

## Pattern Overview

```
┌─────────────────┐
│  Specification  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Code Agent    │  Implements features
└────────┬────────┘
         │
    ┌────┴────┬────────┐
    │         │        │
    ▼         ▼        ▼
┌───────┐ ┌──────┐ ┌───────┐
│ utils │ │ test │ │ server│
└───────┘ └──────┘ └───────┘
```

## Usage

```bash
bun run examples/code-agent/index.ts
```

This will:
1. Spawn a code agent
2. Create a utility module
3. Create tests
4. Create an API server
5. Leave the agent running for interaction

## Key Concepts

### 1. Project-Scoped Agent
Agents work within a specific project directory:

```typescript
const coder = await manager.spawn("claude-code", {
  project: "./my-project",
  instructions: "You are a coding agent...",
});
```

### 2. Sequential Tasks
Send related tasks in sequence to build on previous work:

```typescript
// First, create the module
await manager.send(coder.id, "Create utils/math.ts with add, subtract functions");

// Then, create tests that reference it
await manager.send(coder.id, "Create tests for utils/math.ts");

// Finally, use it in an application
await manager.send(coder.id, "Create a CLI that uses utils/math.ts");
```

### 3. Detailed Specifications
Be specific in your task descriptions:

```typescript
const task = `
Create a file "models/user.ts" with:
- interface User { id: string; email: string; createdAt: Date }
- function createUser(email: string): User
- function validateEmail(email: string): boolean

Export all types and functions.
`;

await manager.send(coder.id, task);
```

### 4. Interactive Mode
Attach to an agent for hands-on debugging:

```typescript
const cmd = manager.getAttachCommand(coder.id);
console.log(cmd); // tmux attach -t botctl-agent-abc123

// Run this in your terminal to interact directly
```

## Tips

1. **One concern per task**: Break work into focused tasks rather than asking for everything at once.

2. **Reference previous work**: "Now create tests for the User model you just made"

3. **Include constraints**: "Keep it under 50 lines", "No external dependencies"

4. **Request summaries**: End instructions with "Summarize what you created"
