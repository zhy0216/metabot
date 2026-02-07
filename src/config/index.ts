import { join } from "path";
import { homedir } from "os";
import type { Config } from "../types";

const DEFAULT_CONFIG: Config = {
  agent: {
    model: "claude-haiku-4-5-20251001",
    provider: "claude-code",
    maxTokens: 4096,
    temperature: 0.7,
    maxToolIterations: 25,
  },
  workspace: join(homedir(), ".metabot", "workspace"),
};

let config: Config | null = null;

export async function loadConfig(customPath?: string): Promise<Config> {
  if (config) return config;

  const configPath = customPath ?? join(homedir(), ".metabot", "config.json");

  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const loaded = await file.json();
      config = mergeConfig(DEFAULT_CONFIG, loaded);
    } else {
      config = { ...DEFAULT_CONFIG };
    }
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  return config;
}

function mergeConfig(defaults: Config, loaded: Partial<Config>): Config {
  return {
    agent: { ...defaults.agent, ...loaded.agent },
    workspace: loaded.workspace ?? defaults.workspace,
  };
}

export async function saveConfig(cfg: Config, customPath?: string): Promise<void> {
  const configPath = customPath ?? join(homedir(), ".metabot", "config.json");
  const dir = configPath.substring(0, configPath.lastIndexOf("/"));

  await Bun.write(join(dir, ".gitkeep"), ""); // ensure dir exists
  await Bun.write(configPath, JSON.stringify(cfg, null, 2));
  config = cfg;
}

export function getConfig(): Config {
  if (!config) {
    throw new Error("Config not loaded. Call loadConfig() first.");
  }
  return config;
}
