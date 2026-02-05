import type { ToolDefinition, ToolResult } from "../types";

export abstract class Tool {
  abstract get name(): string;
  abstract get description(): string;
  abstract get parameters(): ToolDefinition["parameters"];

  abstract execute(args: Record<string, unknown>): Promise<string>;

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  protected formatError(error: unknown): string {
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }
    return `Error: ${String(error)}`;
  }
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map((t) => t.getDefinition());
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    const callId = crypto.randomUUID();

    if (!tool) {
      return {
        callId,
        name,
        result: "",
        error: `Unknown tool: ${name}`,
      };
    }

    try {
      const result = await tool.execute(args);
      return { callId, name, result };
    } catch (error) {
      return {
        callId,
        name,
        result: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Global registry
export const toolRegistry = new ToolRegistry();
