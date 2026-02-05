import { getConfig, getProvider as getProviderConfig } from "../config";
import { LLMProvider } from "./base";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

export { LLMProvider } from "./base";
export { AnthropicProvider } from "./anthropic";
export { OpenAIProvider } from "./openai";

const providerInstances: Map<string, LLMProvider> = new Map();

export function getProvider(name?: string): LLMProvider {
  const cfg = getConfig();
  const { name: providerName, config: providerConfig } = name
    ? { name, config: cfg.providers[name as keyof typeof cfg.providers]! }
    : getProviderConfig();

  // Check cache
  const cached = providerInstances.get(providerName);
  if (cached) return cached;

  // Create provider instance
  let provider: LLMProvider;

  switch (providerName) {
    case "anthropic":
      provider = new AnthropicProvider({
        apiKey: providerConfig.apiKey!,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model ?? cfg.agent.model,
      });
      break;

    case "openai":
      provider = new OpenAIProvider({
        apiKey: providerConfig.apiKey!,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model ?? cfg.agent.model,
      });
      break;

    case "openrouter":
      // OpenRouter uses OpenAI-compatible API
      provider = new OpenAIProvider({
        apiKey: providerConfig.apiKey!,
        baseUrl: providerConfig.baseUrl ?? "https://openrouter.ai/api/v1",
        model: providerConfig.model ?? cfg.agent.model,
      });
      break;

    case "ollama":
      // Ollama uses OpenAI-compatible API
      provider = new OpenAIProvider({
        apiKey: providerConfig.apiKey ?? "ollama",
        baseUrl: providerConfig.baseUrl ?? "http://localhost:11434/v1",
        model: providerConfig.model ?? "llama3.2",
      });
      break;

    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }

  providerInstances.set(providerName, provider);
  return provider;
}

export function clearProviderCache(): void {
  providerInstances.clear();
}
