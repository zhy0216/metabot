import type { InboundMessage, OutboundMessage, LLMMessage, ToolCall, ToolResult, SubagentTask } from "../types";
import { getConfig } from "../config";
import { getProvider } from "../providers";
import { toolRegistry, registerDefaultTools, SpawnTool, MessageTool } from "../tools";
import { sessionManager } from "../session";
import { bus } from "../bus";
import { buildContext } from "./context";
import { SubagentManager } from "./subagent";

export class AgentLoop {
  private running = false;
  private subagentManager: SubagentManager;

  constructor() {
    this.subagentManager = new SubagentManager();
    this.setupTools();
  }

  private setupTools(): void {
    // Register default tools
    registerDefaultTools();

    // Register spawn tool
    const spawnTool = new SpawnTool(async (task: SubagentTask) => {
      await this.subagentManager.run(task);
    });
    toolRegistry.register(spawnTool);

    // Register message tool
    const messageTool = new MessageTool(async (channel, chatId, content) => {
      await bus.publishOutbound({
        id: crypto.randomUUID(),
        channel,
        chatId,
        content,
      });
    });
    toolRegistry.register(messageTool);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Subscribe to inbound messages
    bus.onInbound(async (message) => {
      await this.handleMessage(message);
    });

    // Subscribe to system channel for subagent results
    bus.onInbound(async (message) => {
      if (message.channel === "system") {
        await this.handleSubagentResult(message);
      }
    }, "system");
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async handleMessage(message: InboundMessage): Promise<OutboundMessage> {
    const config = getConfig();
    const provider = getProvider();

    // Get session history
    const session = await sessionManager.get(message.channel, message.chatId);

    // Add user message to history
    await sessionManager.addMessage(message.channel, message.chatId, {
      role: "user",
      content: message.content,
    });

    // Build context
    const { systemPrompt, messages } = await buildContext(
      session.messages,
      message.content
    );

    // Tool execution loop
    let iterations = 0;
    const maxIterations = config.agent.maxToolIterations ?? 25;
    let currentMessages = [...messages];

    while (iterations < maxIterations) {
      iterations++;

      // Call LLM
      const response = await provider.chat(currentMessages, {
        model: config.agent.model,
        maxTokens: config.agent.maxTokens,
        temperature: config.agent.temperature,
        tools: toolRegistry.getDefinitions(),
        systemPrompt,
      });

      // Check if we're done (no tool calls)
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Add assistant response to history
        await sessionManager.addMessage(message.channel, message.chatId, {
          role: "assistant",
          content: response.content,
        });

        // Send response
        const outbound: OutboundMessage = {
          id: crypto.randomUUID(),
          channel: message.channel,
          chatId: message.chatId,
          content: response.content,
          replyTo: message.id,
        };

        await bus.publishOutbound(outbound);
        return outbound;
      }

      // Execute tool calls
      const toolResults = await this.executeToolCalls(
        response.toolCalls,
        message.channel,
        message.chatId
      );

      // Add assistant message with tool calls
      currentMessages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Add tool results
      currentMessages.push({
        role: "user",
        toolResults,
      });
    }

    // Max iterations reached
    const errorResponse: OutboundMessage = {
      id: crypto.randomUUID(),
      channel: message.channel,
      chatId: message.chatId,
      content: "I've reached the maximum number of tool iterations. Please try breaking down your request into smaller steps.",
      replyTo: message.id,
    };

    await bus.publishOutbound(errorResponse);
    return errorResponse;
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    channel: string,
    chatId: string
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of toolCalls) {
      // Set parent context for spawn tool
      if (call.name === "spawn") {
        (call.arguments as Record<string, unknown>).__parentChannel = channel;
        (call.arguments as Record<string, unknown>).__parentChatId = chatId;
      }

      const result = await toolRegistry.execute(call.name, call.arguments);
      results.push({
        ...result,
        callId: call.id,
      });
    }

    return results;
  }

  private async handleSubagentResult(message: InboundMessage): Promise<void> {
    // Parse the original channel:chatId from the system message metadata
    const [originalChannel, originalChatId] = (message.chatId ?? "").split(":");

    if (originalChannel && originalChatId) {
      // Create a new inbound message to process the subagent result
      const resultMessage: InboundMessage = {
        id: crypto.randomUUID(),
        channel: originalChannel,
        chatId: originalChatId,
        userId: "system",
        content: `[Subagent Result]\n\n${message.content}`,
        timestamp: new Date(),
      };

      await this.handleMessage(resultMessage);
    }
  }

  // Direct message processing (for CLI or testing)
  async processMessage(
    content: string,
    channel = "cli",
    chatId = "default"
  ): Promise<string> {
    const inbound: InboundMessage = {
      id: crypto.randomUUID(),
      channel,
      chatId,
      userId: "user",
      content,
      timestamp: new Date(),
    };

    const response = await this.handleMessage(inbound);
    return response.content;
  }
}

export const agentLoop = new AgentLoop();
