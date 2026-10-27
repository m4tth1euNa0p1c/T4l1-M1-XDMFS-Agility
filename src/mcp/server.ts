import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { TRACE_TOOLS } from "../assistant/tools.js";
import { XdmfsError } from "../core/errors.js";
import { createConnectorsFromEnv, type Connectors } from "../connectors/factory.js";
import { loadDotEnv, envString } from "../core/config.js";
import type { TraceStore } from "../memory/store.js";
import { SqliteTraceStore } from "../memory/sqlite-store.js";
import { redact } from "../security/secrets.js";
import { ensureDemoProject } from "../demo/seed.js";

/**
 * Local MCP server exposing read-only tools:
 *  - traceability_* : queries on the stored traceability graph;
 *  - github_*, jira_*, sonarqube_* : thin wrappers over the official REST
 *    APIs, registered only when the connector is configured.
 * No tool mutates an external system.
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

async function safe(fn: () => unknown): Promise<ToolResult> {
  try {
    const value = await fn();
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    const payload =
      error instanceof XdmfsError
        ? error.toJSON()
        : error instanceof z.ZodError
          ? { code: "invalid_request", message: z.prettifyError(error) }
          : {
              code: "upstream_error",
              message: error instanceof Error ? error.message : String(error),
            };
    return { content: [{ type: "text", text: redact(JSON.stringify(payload)) }], isError: true };
  }
}

export interface McpServerOptions {
  store: TraceStore;
  connectors?: Connectors;
  defaultProjectId?: string;
}

export function createMcpServer(options: McpServerOptions): { server: McpServer; tools: string[] } {
  const server = new McpServer({ name: "xdmfs-agility", version: "0.1.0" });
  const tools: string[] = [];
  const { store, connectors = {} } = options;

  const graphFor = (projectId: string | undefined) => {
    const id = projectId ?? options.defaultProjectId;
    if (!id || !store.getProject(id)) {
      throw new XdmfsError(
        "not_found",
        "traceability",
        `Unknown project "${id ?? ""}". Known: ${store
          .listProjects()
          .map((p) => p.id)
          .join(", ")}`,
      );
    }
    return { id, graph: store.loadGraph(id) };
  };

  server.registerTool(
    "traceability_list_projects",
    {
      title: "Projets suivis",
      description: "Liste les projets présents dans la mémoire de traçabilité.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    () =>
      safe(() =>
        store
          .listProjects()
          .map((p) => ({ id: p.id, name: p.name, demo: p.demo, lastSyncAt: p.lastSyncAt })),
      ),
  );
  tools.push("traceability_list_projects");

  for (const tool of TRACE_TOOLS) {
    const base = tool.schema as unknown as z.ZodObject;
    const schema = base.extend({
      project_id: z
        .string()
        .optional()
        .describe("Identifiant du projet (défaut : projet configuré)"),
    });
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: schema, annotations: READ_ONLY },
      (args: Record<string, unknown>) =>
        safe(() => {
          const { project_id, ...rest } = args as { project_id?: string };
          const { id, graph } = graphFor(project_id);
          return tool.run(graph, id, tool.schema.parse(rest));
        }),
    );
    tools.push(tool.name);
  }

  const repo = {
    owner: z.string().describe("Propriétaire du dépôt"),
    repo: z.string().describe("Nom du dépôt"),
  };
  const external = { ...READ_ONLY, openWorldHint: true };

  if (connectors.github) {
    const gh = connectors.github;
    server.registerTool(
      "github_list_pull_requests",
      {
        description: "Liste les pull requests d'un dépôt GitHub (lecture seule).",
        inputSchema: z.object({ ...repo, state: z.enum(["open", "closed", "all"]).default("all") }),
        annotations: external,
      },
      (a: { owner: string; repo: string; state: "open" | "closed" | "all" }) =>
        safe(() => gh.listPullRequests({ owner: a.owner, repo: a.repo }, a.state)),
    );
    server.registerTool(
      "github_get_commit",
      {
        description: "Détail d'un commit GitHub.",
        inputSchema: z.object({ ...repo, sha: z.string() }),
        annotations: external,
      },
      (a: { owner: string; repo: string; sha: string }) =>
        safe(() => gh.getCommit({ owner: a.owner, repo: a.repo }, a.sha)),
    );
    server.registerTool(
      "github_get_workflow_runs",
      {
        description: "Exécutions GitHub Actions d'un dépôt, filtrables par SHA ou branche.",
        inputSchema: z.object({
          ...repo,
          head_sha: z.string().optional(),
          branch: z.string().optional(),
        }),
        annotations: external,
      },
      (a: { owner: string; repo: string; head_sha?: string; branch?: string }) =>
        safe(() =>
          gh.getWorkflowRuns(
            { owner: a.owner, repo: a.repo },
            {
              ...(a.head_sha ? { headSha: a.head_sha } : {}),
              ...(a.branch ? { branch: a.branch } : {}),
            },
          ),
        ),
    );
    tools.push("github_list_pull_requests", "github_get_commit", "github_get_workflow_runs");
  }

  if (connectors.jira) {
    const jira = connectors.jira;
    server.registerTool(
      "jira_search_issues",
      {
        description: "Recherche de tickets Jira par JQL (lecture seule).",
        inputSchema: z.object({
          jql: z.string().min(1).max(2000),
          max_results: z.number().int().min(1).max(100).default(50),
        }),
        annotations: external,
      },
      (a: { jql: string; max_results: number }) =>
        safe(() => jira.searchIssues(a.jql, a.max_results)),
    );
    server.registerTool(
      "jira_get_issue",
      {
        description: "Détail d'un ticket Jira.",
        inputSchema: z.object({ key: z.string() }),
        annotations: external,
      },
      (a: { key: string }) => safe(() => jira.getIssue(a.key)),
    );
    server.registerTool(
      "jira_get_issue_links",
      {
        description: "Liens d'un ticket Jira (bloque, est bloqué par, etc.).",
        inputSchema: z.object({ key: z.string() }),
        annotations: external,
      },
      (a: { key: string }) => safe(() => jira.getIssueLinks(a.key)),
    );
    tools.push("jira_search_issues", "jira_get_issue", "jira_get_issue_links");
  }

  if (connectors.sonarqube) {
    const sonar = connectors.sonarqube;
    const project = { project_key: z.string().describe("Clé du projet SonarQube") };
    server.registerTool(
      "sonarqube_get_project_measures",
      {
        description: "Mesures qualité d'un projet SonarQube (bugs, vulnérabilités, couverture...).",
        inputSchema: z.object(project),
        annotations: external,
      },
      (a: { project_key: string }) => safe(() => sonar.getProjectMeasures(a.project_key)),
    );
    server.registerTool(
      "sonarqube_get_issues",
      {
        description: "Problèmes détectés par SonarQube sur un projet.",
        inputSchema: z.object({
          ...project,
          page_size: z.number().int().min(1).max(500).default(100),
        }),
        annotations: external,
      },
      (a: { project_key: string; page_size: number }) =>
        safe(() => sonar.getIssues(a.project_key, { pageSize: a.page_size })),
    );
    server.registerTool(
      "sonarqube_get_quality_gate",
      {
        description: "Statut de la quality gate d'un projet SonarQube.",
        inputSchema: z.object(project),
        annotations: external,
      },
      (a: { project_key: string }) => safe(() => sonar.getQualityGate(a.project_key)),
    );
    tools.push(
      "sonarqube_get_project_measures",
      "sonarqube_get_issues",
      "sonarqube_get_quality_gate",
    );
  }

  return { server, tools };
}

async function main(): Promise<void> {
  loadDotEnv();
  const store = new SqliteTraceStore(envString("XDMFS_DB_PATH") ?? "data/xdmfs.sqlite");
  store.migrate();
  ensureDemoProject(store);
  const { server, tools } = createMcpServer({
    store,
    connectors: createConnectorsFromEnv(),
    defaultProjectId: envString("XDMFS_DEFAULT_PROJECT") ?? "aurore-pay",
  });
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol: log on stderr only.
  console.error(`xdmfs-agility MCP server ready (${tools.length} tools)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    process.exit(1);
  });
}
