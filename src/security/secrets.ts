/**
 * Secret handling. Values are read once from the environment and never
 * logged, serialized or returned by an API. Only names and presence leak out.
 */

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i;

/** Environment variables the application knows about. */
export const KNOWN_ENV = {
  ANTHROPIC_API_KEY: "Anthropic API key (provider: anthropic)",
  ANTHROPIC_MODEL: "Model id for the Anthropic provider",
  LLM_PROVIDER: "anthropic | bedrock | azure-foundry | none",
  AWS_REGION: "AWS region for Bedrock",
  BEDROCK_MODEL_ID: "Bedrock model id",
  AZURE_FOUNDRY_ENDPOINT: "Azure AI Foundry endpoint URL",
  AZURE_FOUNDRY_API_KEY: "Azure AI Foundry API key",
  AZURE_FOUNDRY_DEPLOYMENT: "Azure AI Foundry deployment / model name",
  GITHUB_TOKEN: "GitHub token, read-only scopes",
  GITHUB_API_URL: "GitHub API base URL (default https://api.github.com)",
  JIRA_BASE_URL: "Jira site URL, e.g. https://example.atlassian.net",
  JIRA_EMAIL: "Jira account email (Cloud basic auth)",
  JIRA_API_TOKEN: "Jira API token",
  SONARQUBE_URL: "SonarQube server URL",
  SONARQUBE_TOKEN: "SonarQube user token",
  XDMFS_DB_PATH: "SQLite database path",
  PORT: "HTTP port for the API server",
} as const;

export type KnownEnvName = keyof typeof KNOWN_ENV;

export function isSecretName(name: string): boolean {
  return SECRET_NAME.test(name);
}

/** Reports which known variables are set, without exposing any value. */
export function describeEnvironment(env: NodeJS.ProcessEnv = process.env): Array<{
  name: string;
  set: boolean;
  secret: boolean;
}> {
  return Object.keys(KNOWN_ENV).map((name) => ({
    name,
    set: typeof env[name] === "string" && env[name] !== "",
    secret: isSecretName(name),
  }));
}

/**
 * Replaces any occurrence of known secret values in a string. Used before
 * logging errors coming from upstream libraries.
 */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8 || !isSecretName(name)) continue;
    out = out.split(value).join(`[REDACTED:${name}]`);
  }
  // Generic token shapes, in case a secret is not in env.
  return out
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/squ_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/(authorization:\s*)(bearer|basic)\s+[^\s"']+/gi, "$1$2 [REDACTED]");
}

/**
 * Minimal .env loader (KEY=VALUE lines). Does not override variables that
 * are already set, and never prints anything.
 */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
