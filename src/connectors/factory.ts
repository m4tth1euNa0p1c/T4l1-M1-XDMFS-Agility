import { envString } from "../core/config.js";
import { GitHubConnector } from "./github.js";
import { JiraConnector } from "./jira.js";
import { SonarQubeConnector } from "./sonarqube.js";

export interface Connectors {
  github?: GitHubConnector;
  jira?: JiraConnector;
  sonarqube?: SonarQubeConnector;
}

export interface ConnectorStatus {
  name: "github" | "jira" | "sonarqube";
  configured: boolean;
  detail: string;
}

/** Builds only the connectors whose configuration is present. */
export function createConnectorsFromEnv(env: NodeJS.ProcessEnv = process.env): Connectors {
  const out: Connectors = {};
  const ghToken = envString("GITHUB_TOKEN", env);
  out.github = new GitHubConnector({
    ...(ghToken ? { token: ghToken } : {}),
    ...(envString("GITHUB_API_URL", env) ? { baseUrl: envString("GITHUB_API_URL", env)! } : {}),
  });

  const jiraUrl = envString("JIRA_BASE_URL", env);
  const jiraToken = envString("JIRA_API_TOKEN", env);
  if (jiraUrl && jiraToken) {
    const email = envString("JIRA_EMAIL", env);
    out.jira = new JiraConnector({
      baseUrl: jiraUrl,
      apiToken: jiraToken,
      edition: email ? "cloud" : "datacenter",
      ...(email ? { email } : {}),
    });
  }

  const sonarUrl = envString("SONARQUBE_URL", env);
  if (sonarUrl) {
    const token = envString("SONARQUBE_TOKEN", env);
    out.sonarqube = new SonarQubeConnector({ baseUrl: sonarUrl, ...(token ? { token } : {}) });
  }
  return out;
}

export function connectorStatus(env: NodeJS.ProcessEnv = process.env): ConnectorStatus[] {
  return [
    {
      name: "github",
      configured: true,
      detail: envString("GITHUB_TOKEN", env)
        ? "token configured"
        : "anonymous (public repositories, low rate limit)",
    },
    {
      name: "jira",
      configured: Boolean(envString("JIRA_BASE_URL", env) && envString("JIRA_API_TOKEN", env)),
      detail: envString("JIRA_BASE_URL", env) ? "url set" : "JIRA_BASE_URL not set",
    },
    {
      name: "sonarqube",
      configured: Boolean(envString("SONARQUBE_URL", env)),
      detail: envString("SONARQUBE_TOKEN", env)
        ? "url + token set"
        : envString("SONARQUBE_URL", env)
          ? "url set, no token"
          : "SONARQUBE_URL not set",
    },
  ];
}
