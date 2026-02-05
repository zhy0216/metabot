import type { SubagentTask, LLMMessage } from "../types";
import { getConfig } from "../config";
import { getProvider } from "../providers";
import { ToolRegistry, ReadFileTool, WriteFileTool, EditFileTool, ListDirTool, ExecTool } from "../tools";
import { bus } from "../bus";
import { getSubagentTask } from "../tools/spawn";

export class SubagentManager {
  private activeTasks: Map<string, Promise<void>> = new Map();

  async run(task: SubagentTask): Promise<void> {
    // Update task status
    task.status = "running";

    // Create isolated tool registry for subagent (no spawn, no message)
    const subagentTools = new ToolRegistry();
    subagentTools.register(new ReadFileTool());
    subagentTools.register(new WriteFileTool());
    subagentTools.register(new EditFileTool());
    subagentTools.register(new ListDirTool());
    subagentTools.register(new ExecTool());

    // Run the subagent
    const taskPromise = this.executeSubagent(task, subagentTools);
    this.activeTasks.set(task.id, taskPromise);

    try {
      await taskPromise;
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  private async executeSubagent(
    task: SubagentTask,
    tools: ToolRegistry
  ): Promise<void> {
    const config = getConfig();
    const provider = getProvider();

    const systemPrompt = `You are a focused subagent. Your sole task is:

${task.task}

Guidelines:
- Complete ONLY the assigned task
- Be efficient and direct
- Use tools as needed to accomplish the task
- When done, provide a clear summary of what was accomplished
- Do NOT interact with users directly
- Do NOT spawn other subagents`;

    const messages: LLMMessage[] = [
      {
        role: "user",
        content: `Please complete this task: ${task.task}`,
      },
    ];

    let iterations = 0;
    const maxIterations = Math.min(config.agent.maxToolIterations ?? 25, 15);

    try {
      while (iterations < maxIterations) {
        iterations++;

        const response = await provider.chat(messages, {
          model: config.agent.model,
          maxTokens: config.agent.maxTokens,
          temperature: config.agent.temperature,
          tools: tools.getDefinitions(),
          systemPrompt,
        });

        // Check if done
        if (!response.toolCalls || response.toolCalls.length === 0) {
          // Task completed
          task.status = "completed";
          task.result = response.content;
          task.completedAt = new Date();

          // Publish result to system channel
          await this.publishResult(task);
          return;
        }

        // Execute tool calls
        const toolResults = await Promise.all(
          response.toolCalls.map((call) => tools.execute(call.name, call.arguments))
        );

        // Update tool result call IDs
        for (let i = 0; i < toolResults.length; i++) {
          toolResults[i].callId = response.toolCalls[i].id;
        }

        // Add to messages
        messages.push({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });

        messages.push({
          role: "user",
          toolResults,
        });
      }

      // Max iterations reached
      task.status = "completed";
      task.result = "Subagent reached maximum iterations without completing the task.";
      task.completedAt = new Date();
      await this.publishResult(task);
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();
      await this.publishResult(task);
    }
  }

  private async publishResult(task: SubagentTask): Promise<void> {
    const content = task.status === "completed"
      ? `Subagent "${task.label}" (${task.id}) completed:\n\n${task.result}`
      : `Subagent "${task.label}" (${task.id}) failed:\n\n${task.error}`;

    // Publish to system channel with original context in chatId
    await bus.publishInbound({
      id: crypto.randomUUID(),
      channel: "system",
      chatId: `${task.parentChannel}:${task.parentChatId}`,
      userId: "subagent",
      content,
      timestamp: new Date(),
      metadata: { subagentId: task.id },
    });
  }

  getActiveCount(): number {
    return this.activeTasks.size;
  }

  isRunning(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }
}
