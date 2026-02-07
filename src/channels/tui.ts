import { createInterface } from "readline";
import { BaseChannel } from "./base";
import type { ChannelConfig } from "./types";

interface TuiChannelConfig extends ChannelConfig {
  message?: string;
}

export class TuiChannel extends BaseChannel {
  private message?: string;

  constructor(config: TuiChannelConfig) {
    super(config);
    this.message = config.message;
  }

  protected async run(): Promise<void> {
    if (this.message) {
      const response = await this.client.send(this.agent.id, this.message);
      console.log(response.text);
      await this.stop();
      return;
    }

    console.log(`botctl chat  (model: ${this.agent.type})`);
    console.log("Type /exit or Ctrl+C to quit.\n");

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
    });

    const cleanup = async () => {
      rl.close();
      await this.stop();
    };

    rl.prompt();

    rl.on("line", async (line: string) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      if (input === "/exit" || input === "/quit") {
        await cleanup();
        process.exit(0);
      }

      try {
        process.stdout.write("\n");
        const response = await this.client.send(this.agent.id, input);
        console.log(response.text);
        console.log();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}\n`);
      }
      rl.prompt();
    });

    rl.on("close", async () => {
      console.log();
      await cleanup();
      process.exit(0);
    });
  }
}
