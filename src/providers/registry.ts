import { XdmfsError } from "../core/errors.js";
import { envString } from "../core/config.js";
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.js";
import { AzureFoundryProvider } from "./azure-foundry.js";
import { BedrockProvider, type BedrockTransport } from "./bedrock.js";
import type { LLMProvider } from "./types.js";

export interface ProviderFactoryOptions {
  env?: NodeJS.ProcessEnv;
  bedrockTransport?: BedrockTransport;
}

/**
 * Builds the provider selected by LLM_PROVIDER. Returns null when no
 * provider is configured: the app then runs in deterministic mode only.
 */
export function createProviderFromEnv(options: ProviderFactoryOptions = {}): LLMProvider | null {
  const env = options.env ?? process.env;
  const selected = (
    envString("LLM_PROVIDER", env) ?? (envString("ANTHROPIC_API_KEY", env) ? "anthropic" : "none")
  ).toLowerCase();

  switch (selected) {
    case "none":
      return null;
    case "anthropic": {
      const apiKey = envString("ANTHROPIC_API_KEY", env);
      return new AnthropicProvider({
        ...(apiKey ? { apiKey } : {}),
        model: envString("ANTHROPIC_MODEL", env) ?? DEFAULT_ANTHROPIC_MODEL,
      });
    }
    case "bedrock": {
      const modelId = envString("BEDROCK_MODEL_ID", env);
      const region = envString("AWS_REGION", env);
      return new BedrockProvider({
        ...(modelId ? { modelId } : {}),
        ...(region ? { region } : {}),
        ...(options.bedrockTransport ? { transport: options.bedrockTransport } : {}),
      });
    }
    case "azure-foundry": {
      const endpoint = envString("AZURE_FOUNDRY_ENDPOINT", env);
      const apiKey = envString("AZURE_FOUNDRY_API_KEY", env);
      const deployment = envString("AZURE_FOUNDRY_DEPLOYMENT", env);
      return new AzureFoundryProvider({
        ...(endpoint ? { endpoint } : {}),
        ...(apiKey ? { apiKey } : {}),
        ...(deployment ? { deployment } : {}),
      });
    }
    default:
      throw new XdmfsError("invalid_request", "registry", `Unknown LLM_PROVIDER "${selected}".`);
  }
}
