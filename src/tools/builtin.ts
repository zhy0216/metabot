import { Tool } from "./base";
import { readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import { getConfig } from "../config";

export class ReadFileTool extends Tool {
  get name() {
    return "read_file";
  }

  get description() {
    return "Read the contents of a file at the specified path";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "The path to the file to read",
        },
      },
      required: ["path"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const path = resolve(args.path as string);
    const file = Bun.file(path);

    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`);
    }

    return await file.text();
  }
}

export class WriteFileTool extends Tool {
  get name() {
    return "write_file";
  }

  get description() {
    return "Write content to a file at the specified path. Creates the file if it doesn't exist.";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "The path to the file to write",
        },
        content: {
          type: "string" as const,
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const path = resolve(args.path as string);
    const content = args.content as string;

    await Bun.write(path, content);
    return `Successfully wrote ${content.length} bytes to ${path}`;
  }
}

export class EditFileTool extends Tool {
  get name() {
    return "edit_file";
  }

  get description() {
    return "Edit a file by replacing a specific string with another string";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "The path to the file to edit",
        },
        old_string: {
          type: "string" as const,
          description: "The string to search for and replace",
        },
        new_string: {
          type: "string" as const,
          description: "The string to replace with",
        },
      },
      required: ["path", "old_string", "new_string"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const path = resolve(args.path as string);
    const oldString = args.old_string as string;
    const newString = args.new_string as string;

    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`);
    }

    const content = await file.text();
    if (!content.includes(oldString)) {
      throw new Error(`String not found in file: ${oldString.slice(0, 50)}...`);
    }

    const newContent = content.replace(oldString, newString);
    await Bun.write(path, newContent);

    return `Successfully edited ${path}`;
  }
}

export class ListDirTool extends Tool {
  get name() {
    return "list_dir";
  }

  get description() {
    return "List the contents of a directory";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "The path to the directory to list",
        },
      },
      required: ["path"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const path = resolve(args.path as string);
    const entries = await readdir(path);

    const result: string[] = [];
    for (const entry of entries) {
      const entryPath = join(path, entry);
      const stats = await stat(entryPath);
      const type = stats.isDirectory() ? "dir" : "file";
      result.push(`${type}\t${entry}`);
    }

    return result.join("\n");
  }
}

export class ExecTool extends Tool {
  get name() {
    return "exec";
  }

  get description() {
    return "Execute a shell command and return the output";
  }

  get parameters() {
    return {
      type: "object" as const,
      properties: {
        command: {
          type: "string" as const,
          description: "The shell command to execute",
        },
        cwd: {
          type: "string" as const,
          description: "The working directory for the command (optional)",
        },
      },
      required: ["command"],
    };
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = args.command as string;
    const cwd = args.cwd as string | undefined;
    const config = getConfig();
    const timeout = config.tools?.exec?.timeout ?? 30000;

    const proc = Bun.spawn(["sh", "-c", command], {
      cwd: cwd ?? process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    // Set timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      const result = await Promise.race([proc.exited, timeoutPromise]);
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (result !== 0) {
        return `Exit code: ${result}\nStderr: ${stderr}\nStdout: ${stdout}`;
      }

      return stdout || stderr || "(no output)";
    } catch (error) {
      throw error;
    }
  }
}
