import { join } from "path";
import { homedir } from "os";
import type { Config, ProviderConfig } from "../types";

const DEFAULT_CONFIG: Config = {
  agent: {
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    maxTokens: 4096,
    temperature: 0.7,
    maxToolIterations: 25,
  },
  providers: {},
  channels: {
    cli: { enabled: true },
  },
  tools: {
    exec: { timeout: 30000 },
  },
  workspace: join(homedir(), ".botctl"),
};

let config: Config | null = null;

export async function loadConfig(customPath?: string): Promise<Config> {
  if (config) return config;

  const configPath = customPath ?? join(homedir(), ".botctl", "config.json");

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

  // Load provider API keys from environment
  loadEnvProviders(config);

  return config;
}

function mergeConfig(defaults: Config, loaded: Partial<Config>): Config {
  return {
    agent: { ...defaults.agent, ...loaded.agent },
    providers: { ...defaults.providers, ...loaded.providers },
    channels: { ...defaults.channels, ...loaded.channels },
    tools: { ...defaults.tools, ...loaded.tools },
    workspace: loaded.workspace ?? defaults.workspace,
  };
}

function loadEnvProviders(cfg: Config): void {
  const envMappings: Record<string, keyof Config["providers"]> = {
    ANTHROPIC_API_KEY: "anthropic",
    OPENAI_API_KEY: "openai",
    OPENROUTER_API_KEY: "openrouter",
  };

  for (const [envVar, provider] of Object.entries(envMappings)) {
    const apiKey = process.env[envVar];
    if (apiKey) {
      cfg.providers[provider] = {
        ...cfg.providers[provider],
        apiKey,
        enabled: true,
      };
    }
  }
}

export async function saveConfig(cfg: Config, customPath?: string): Promise<void> {
  const configPath = customPath ?? join(homedir(), ".botctl", "config.json");
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

export function getProvider(): { name: string; config: ProviderConfig } {
  const cfg = getConfig();

  // Priority order for providers
  const priority: (keyof Config["providers"])[] = [
    "anthropic",
    "openai",
    "openrouter",
    "ollama",
  ];

  for (const name of priority) {
    const provider = cfg.providers[name];
    if (provider?.enabled && provider.apiKey) {
      return { name, config: provider };
    }
  }

  // Check if explicit provider is set
  const explicit = cfg.agent.provider as keyof Config["providers"];
  if (cfg.providers[explicit]) {
    return { name: explicit, config: cfg.providers[explicit]! };
  }

  throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY or configure a provider.");
}
