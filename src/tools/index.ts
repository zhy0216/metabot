export { Tool, ToolRegistry, toolRegistry } from "./base";
export {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ListDirTool,
  ExecTool,
} from "./builtin";
export { SpawnTool, MessageTool, getSubagentTasks, getSubagentTask } from "./spawn";

import { toolRegistry } from "./base";
import {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ListDirTool,
  ExecTool,
} from "./builtin";

// Register default tools
export function registerDefaultTools(): void {
  toolRegistry.register(new ReadFileTool());
  toolRegistry.register(new WriteFileTool());
  toolRegistry.register(new EditFileTool());
  toolRegistry.register(new ListDirTool());
  toolRegistry.register(new ExecTool());
}
