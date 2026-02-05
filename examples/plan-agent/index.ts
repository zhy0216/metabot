// examples/plan-agent/index.ts
// Demonstrates an orchestrator agent that plans tasks and delegates to worker agents

import { AgentManager, TmuxDriver, ClaudeCodeAdapter } from "../../src";

const PLANNER_INSTRUCTIONS = `
You are a planning agent. Your job is to:
1. Break down complex tasks into smaller, actionable steps
2. Identify dependencies between steps
3. Output a structured plan in JSON format

When given a task, respond with a JSON plan:
{
  "goal": "the main objective",
  "steps": [
    { "id": 1, "task": "description", "depends_on": [] },
    { "id": 2, "task": "description", "depends_on": [1] }
  ]
}
`;

async function main() {
  const tmux = new TmuxDriver();
  const manager = new AgentManager(tmux);
  manager.registerAdapter(new ClaudeCodeAdapter());

  console.log("🚀 Spawning plan agent...");

  // Spawn the planner agent
  const planner = await manager.spawn("claude-code", {
    project: process.cwd(),
    instructions: PLANNER_INSTRUCTIONS,
  });

  console.log(`✓ Plan agent spawned: ${planner.id}`);

  // Send a planning task
  const task = "Create a REST API with user authentication and a todo list feature";
  console.log(`\n📋 Sending task: "${task}"`);

  const response = await manager.send(planner.id, `Plan this task: ${task}`);
  console.log("\n📝 Plan agent response:");
  console.log(response.text);

  // In a real orchestration scenario, you would:
  // 1. Parse the plan from the response
  // 2. Spawn worker agents for each independent step
  // 3. Coordinate execution based on dependencies

  console.log("\n🔗 Example: Spawning worker agents for each step...");

  // Demo: spawn a worker for the first step
  const worker = await manager.spawn("claude-code", {
    project: process.cwd(),
    instructions: "You are a focused implementation agent. Complete assigned tasks concisely.",
  });

  console.log(`✓ Worker agent spawned: ${worker.id}`);

  // Send first task to worker
  const workerTask = "Create a basic Express.js server setup with health check endpoint";
  console.log(`\n🔨 Assigning to worker: "${workerTask}"`);

  const workerResponse = await manager.send(worker.id, workerTask);
  console.log("\n✓ Worker response:");
  console.log(workerResponse.text.slice(0, 500) + "...");

  // Cleanup
  console.log("\n🧹 Cleaning up agents...");
  await manager.kill(planner.id);
  await manager.kill(worker.id);
  console.log("✓ Done");
}

main().catch(console.error);
