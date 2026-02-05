// examples/parallel-agents/index.ts
// Demonstrates spawning multiple agents to work in parallel

import { AgentManager, TmuxDriver, ClaudeCodeAdapter } from "../../src";

async function main() {
  const tmux = new TmuxDriver();
  const manager = new AgentManager(tmux);
  manager.registerAdapter(new ClaudeCodeAdapter());

  const projectDir = `${process.cwd()}/examples/parallel-agents/demo-project`;
  await Bun.$`mkdir -p ${projectDir}`.quiet();

  console.log("🚀 Spawning parallel agents...\n");

  // Spawn multiple agents simultaneously
  const [frontend, backend, tests] = await Promise.all([
    manager.spawn("claude-code", {
      project: projectDir,
      instructions: "You are a frontend specialist. Focus on UI components and styling.",
    }),
    manager.spawn("claude-code", {
      project: projectDir,
      instructions: "You are a backend specialist. Focus on API routes and data models.",
    }),
    manager.spawn("claude-code", {
      project: projectDir,
      instructions: "You are a testing specialist. Focus on writing comprehensive tests.",
    }),
  ]);

  console.log("✓ Agents spawned:");
  console.log(`  Frontend: ${frontend.id}`);
  console.log(`  Backend:  ${backend.id}`);
  console.log(`  Tests:    ${tests.id}`);

  // Send tasks to all agents in parallel (async - don't wait)
  console.log("\n📤 Sending tasks to all agents...\n");

  await Promise.all([
    manager.sendAsync(frontend.id, `
      Create "components/Button.tsx" - a reusable React button component with:
      - variants: primary, secondary, danger
      - sizes: sm, md, lg
      - loading state with spinner
      Use TypeScript and Tailwind CSS.
    `),
    manager.sendAsync(backend.id, `
      Create "api/users.ts" with:
      - GET /api/users - list all users
      - POST /api/users - create user
      - GET /api/users/:id - get user by id
      Use Bun.serve() with proper error handling.
    `),
    manager.sendAsync(tests.id, `
      Create "tests/setup.ts" with test utilities:
      - mockFetch(responses: Record<string, any>) - mocks fetch calls
      - createTestUser(overrides?: Partial<User>) - creates test user fixture
      - waitFor(condition: () => boolean, timeout?: number) - async helper
      Use bun:test.
    `),
  ]);

  console.log("✓ Tasks dispatched to all agents");
  console.log("  Agents are now working in parallel...\n");

  // Poll for completion
  const pollInterval = 2000;
  const maxWait = 120000;
  const startTime = Date.now();

  console.log("⏳ Waiting for agents to complete...");

  while (Date.now() - startTime < maxWait) {
    const statuses = {
      frontend: manager.getStatus(frontend.id),
      backend: manager.getStatus(backend.id),
      tests: manager.getStatus(tests.id),
    };

    const allIdle = Object.values(statuses).every((s) => s === "idle");

    if (allIdle) {
      console.log("✓ All agents completed!\n");
      break;
    }

    const working = Object.entries(statuses)
      .filter(([_, s]) => s === "working")
      .map(([name]) => name);

    process.stdout.write(`\r  Still working: ${working.join(", ")}...`);
    await Bun.sleep(pollInterval);
  }

  // Collect results
  console.log("\n📋 Results:\n");

  const results = await Promise.all([
    manager.getOutput(frontend.id),
    manager.getOutput(backend.id),
    manager.getOutput(tests.id),
  ]);

  console.log("Frontend agent output (truncated):");
  console.log(results[0].slice(-500) + "\n");

  console.log("Backend agent output (truncated):");
  console.log(results[1].slice(-500) + "\n");

  console.log("Tests agent output (truncated):");
  console.log(results[2].slice(-500) + "\n");

  // Cleanup
  console.log("🧹 Cleaning up...");
  await Promise.all([
    manager.kill(frontend.id),
    manager.kill(backend.id),
    manager.kill(tests.id),
  ]);

  console.log("✓ Done");
}

main().catch(console.error);
