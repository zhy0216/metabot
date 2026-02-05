// src/cli/commands/send.ts
import { getManager } from "./spawn";

export async function runSend(args: string[]): Promise<void> {
  const isAsync = args[0] === "--async";
  const remaining = isAsync ? args.slice(1) : args;
  const id = remaining[0];
  const prompt = remaining.slice(1).join(" ");

  if (!id || !prompt) {
    console.error("Usage: botctl send [--async] <agent-id> <prompt>");
    process.exit(1);
  }

  const manager = getManager();

  if (isAsync) {
    await manager.sendAsync(id, prompt);
    console.log("Prompt sent");
  } else {
    const result = await manager.send(id, prompt);
    if (result.error) {
      console.error(`Error: ${result.error}`);
    } else {
      console.log(result.text);
    }
  }
}
