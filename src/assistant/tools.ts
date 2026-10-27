import { z } from "zod";
import type { TraceGraph } from "../traceability/graph.js";
import * as Q from "../traceability/questions.js";
import type { ToolDefinition } from "../providers/types.js";

/**
 * Traceability tools shared by the LLM agent and the MCP server.
 * Names use underscores: the Anthropic API and several MCP clients reject
 * dots in tool names. Mapping to the proposed contracts:
 *   traceability.get_issue_delivery_chain -> traceability_get_issue_delivery_chain
 */

export interface TraceTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(graph: TraceGraph, projectId: string, input: z.infer<S>): unknown;
}

const noInput = z.object({}).strict();

export const TRACE_TOOLS: TraceTool[] = [
  {
    name: "traceability_project_overview",
    description:
      "Vue d'ensemble du projet : organisations, membres, statistiques des tickets, sprints et commits par organisation.",
    schema: noInput,
    run: (g, p) => Q.projectOverview(g, p),
  },
  {
    name: "traceability_tickets_for_pull_request",
    description:
      "Tickets Jira associés à une pull request, avec le statut du lien (verified/inferred) et les preuves.",
    schema: z.object({ pr_number: z.number().int().positive() }).strict(),
    run: (g, p, i: { pr_number: number }) => Q.ticketsForPullRequest(g, p, i.pr_number),
  },
  {
    name: "traceability_changes_without_ticket",
    description:
      "Pull requests et commits sans ticket Jira associé, et combien sont déjà en production.",
    schema: noInput,
    run: (g, p) => Q.changesWithoutTicket(g, p),
  },
  {
    name: "traceability_get_pull_request_quality",
    description:
      "Pull requests sans contrôle qualité vérifié : CI absente ou en échec, analyse SonarQube absente ou en échec.",
    schema: noInput,
    run: (g, p) => Q.pullRequestsWithoutQualityCheck(g, p),
  },
  {
    name: "traceability_issues_blocked_by_quality",
    description: "Tickets bloqués par une quality gate SonarQube en échec sur leur pull request.",
    schema: noInput,
    run: (g, p) => Q.issuesBlockedByQuality(g, p),
  },
  {
    name: "traceability_deployed_changes",
    description:
      "Tickets et commits réellement présents dans le dernier déploiement réussi d'un environnement.",
    schema: z.object({ environment: z.string().min(1).max(40).default("production") }).strict(),
    run: (g, p, i: { environment: string }) => Q.deployedChanges(g, p, i.environment),
  },
  {
    name: "traceability_get_issue_delivery_chain",
    description:
      "Chaîne complète d'un ticket : branches, commits, PR, builds, quality gates, déploiements, et informations manquantes.",
    schema: z.object({ issue_key: z.string().regex(/^[A-Z][A-Z0-9_]{1,9}-\d{1,7}$/) }).strict(),
    run: (g, p, i: { issue_key: string }) => Q.issueDeliveryChain(g, p, i.issue_key),
  },
  {
    name: "traceability_missing_delivery_information",
    description:
      "Pour chaque ticket commencé, les informations qui manquent pour confirmer sa livraison.",
    schema: noInput,
    run: (g, p) => Q.missingDeliveryInformation(g, p),
  },
  {
    name: "traceability_get_release_risks",
    description:
      "Risques de release classés par gravité : tickets terminés non livrés, PR fusionnées malgré une quality gate en échec, blocages.",
    schema: noInput,
    run: (g, p) => Q.releaseRisks(g, p),
  },
];

export function toolDefinitions(): ToolDefinition[] {
  return TRACE_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.schema) as Record<string, unknown>,
  }));
}

export function runTraceTool(
  graph: TraceGraph,
  projectId: string,
  name: string,
  input: unknown,
): unknown {
  const tool = TRACE_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  return tool.run(graph, projectId, tool.schema.parse(input ?? {}));
}
