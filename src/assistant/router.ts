import type { TraceGraph } from "../traceability/graph.js";
import type { Answer } from "../traceability/questions.js";
import { runTraceTool } from "./tools.js";

/**
 * Deterministic intent router: maps a French question to a traceability
 * tool without any LLM. Same question, same answer.
 */

export interface RoutedAnswer {
  mode: "deterministic";
  tool: string | null;
  input: Record<string, unknown>;
  text: string;
  answer: Answer<unknown> | null;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function routeQuestion(
  question: string,
  issueKeyPrefixes: readonly string[],
): { tool: string | null; input: Record<string, unknown> } {
  const n = normalize(question);
  const issue = question.toUpperCase().match(/\b([A-Z][A-Z0-9_]{1,9}-\d{1,7})\b/);
  const pr = n.match(/(?:\bpr ?#?|pull request ?#?|#)(\d{1,6})\b/);

  if (pr && !/sans ticket/.test(n))
    return { tool: "traceability_tickets_for_pull_request", input: { pr_number: Number(pr[1]) } };
  if (issue && issueKeyPrefixes.includes(issue[1]!.split("-")[0]!)) {
    return { tool: "traceability_get_issue_delivery_chain", input: { issue_key: issue[1] } };
  }
  if (/sans ticket|pas de ticket|non trace|sans jira/.test(n))
    return { tool: "traceability_changes_without_ticket", input: {} };
  if (/bloqu/.test(n) && /(sonar|qualit|gate)/.test(n))
    return { tool: "traceability_issues_blocked_by_quality", input: {} };
  if (/(controle|qualit|sonar|quality|ci\b|build)/.test(n))
    return { tool: "traceability_get_pull_request_quality", input: {} };
  if (/(manque|information|confirmer|preuve)/.test(n))
    return { tool: "traceability_missing_delivery_information", input: {} };
  if (/risque|release|mise en production prochaine/.test(n))
    return { tool: "traceability_get_release_risks", input: {} };
  if (/(deploy|livre|production|staging|recette)/.test(n)) {
    return {
      tool: "traceability_deployed_changes",
      input: { environment: /staging|recette/.test(n) ? "staging" : "production" },
    };
  }
  if (
    /(resume|vue d'ensemble|synthese|equipe|qui travaille|organisation|sprint|avancement)/.test(n)
  ) {
    return { tool: "traceability_project_overview", input: {} };
  }
  return { tool: null, input: {} };
}

export const HELP_TEXT =
  "Je peux répondre à : « Quels tickets sont liés à la PR #13 ? », « Quels changements n'ont pas de ticket ? », « Quelles PR n'ont pas de contrôle qualité ? », « Quels tickets sont bloqués par SonarQube ? », « Qu'est-ce qui est en production ? », « Chaîne de PAY-6 », « Quelles informations manquent ? », « Risques de release ».";

export function answerDeterministic(
  graph: TraceGraph,
  projectId: string,
  question: string,
  issueKeyPrefixes: readonly string[],
): RoutedAnswer {
  const { tool, input } = routeQuestion(question, issueKeyPrefixes);
  if (!tool) return { mode: "deterministic", tool: null, input, text: HELP_TEXT, answer: null };
  const answer = runTraceTool(graph, projectId, tool, input) as Answer<unknown>;
  return { mode: "deterministic", tool, input, text: summarize(tool, answer), answer };
}

/** One-paragraph French summary of a structured answer. */
export function summarize(tool: string, a: Answer<unknown>): string {
  const d = a.data as Record<string, unknown> | unknown[] | null;
  const prefix = a.demo ? "[Démo] " : "";
  if (d === null) return prefix + (a.limitations[0] ?? "Aucune donnée.");
  switch (tool) {
    case "traceability_tickets_for_pull_request": {
      const x = d as { pullRequest: string; issues: Array<{ key: string; linkStatus: string }> };
      if (x.issues.length === 0) return `${prefix}Aucun ticket trouvé pour la PR ${x.pullRequest}.`;
      return `${prefix}La PR ${x.pullRequest} est reliée à ${x.issues.map((i) => `${i.key} (${i.linkStatus})`).join(", ")}.`;
    }
    case "traceability_changes_without_ticket": {
      const x = d as {
        pullRequests: unknown[];
        commits: unknown[];
        deployedInProductionWithoutTicket: number;
      };
      return `${prefix}${x.pullRequests.length} PR et ${x.commits.length} commit(s) n'ont pas de ticket ; ${x.deployedInProductionWithoutTicket} de ces commits sont en production.`;
    }
    case "traceability_get_pull_request_quality": {
      const x = d as Array<{ number: number; problems: string[] }>;
      if (x.length === 0)
        return `${prefix}Toutes les PR ont un build CI réussi et une quality gate OK.`;
      return `${prefix}${x.length} PR sans contrôle qualité vérifié : ${x.map((r) => `#${r.number} (${r.problems.join(", ")})`).join(" ; ")}.`;
    }
    case "traceability_issues_blocked_by_quality": {
      const x = d as Array<{ key: string; pullRequest: number }>;
      if (x.length === 0) return `${prefix}Aucun ticket n'est bloqué par SonarQube.`;
      return `${prefix}Bloqués par SonarQube : ${x.map((r) => `${r.key} via la PR #${r.pullRequest}`).join(", ")}.`;
    }
    case "traceability_deployed_changes": {
      const x = d as {
        environment: string;
        deployment: { id: string; date: string } | null;
        issues: Array<{ key: string }>;
      };
      if (!x.deployment) return `${prefix}Aucun déploiement réussi en ${x.environment}.`;
      return `${prefix}Le dernier déploiement réussi en ${x.environment} (#${x.deployment.id}) contient ${x.issues.length} ticket(s) : ${x.issues.map((i) => i.key).join(", ")}.`;
    }
    case "traceability_get_issue_delivery_chain": {
      const x = d as {
        issue: { key: string; status: string };
        pullRequests: unknown[];
        commits: unknown[];
        deliveredToProduction: boolean;
        missing: string[];
      };
      const state = x.deliveredToProduction
        ? "est en production"
        : "n'est pas prouvé en production";
      const gaps = x.missing.length
        ? ` Manques : ${x.missing.join(" ")}`
        : " Aucune information manquante.";
      return `${prefix}${x.issue.key} (${x.issue.status}) : ${x.commits.length} commit(s), ${x.pullRequests.length} PR, ${state}.${gaps}`;
    }
    case "traceability_missing_delivery_information": {
      const x = d as { issues: Array<{ key: string }>; unsyncedReferencedTickets: string[] };
      const extra = x.unsyncedReferencedTickets.length
        ? ` Tickets cités mais non synchronisés : ${x.unsyncedReferencedTickets.join(", ")}.`
        : "";
      return `${prefix}${x.issues.length} ticket(s) ont des preuves de livraison incomplètes : ${x.issues.map((i) => i.key).join(", ")}.${extra}`;
    }
    case "traceability_get_release_risks": {
      const x = d as Array<{ severity: string; message: string }>;
      if (x.length === 0) return `${prefix}Aucun risque détecté.`;
      return `${prefix}${x.length} risque(s) : ${x
        .slice(0, 4)
        .map((r) => r.message)
        .join(" ")}${x.length > 4 ? " …" : ""}`;
    }
    case "traceability_project_overview": {
      const x = d as {
        project: { name: string } | null;
        issues: { total: number; done: number; inProgress: number; deliveredToProduction: number };
        organizations: unknown[];
      };
      return `${prefix}${x.project?.name ?? "Projet"} : ${x.issues.total} tickets, ${x.issues.done} terminés, ${x.issues.inProgress} en cours, ${x.issues.deliveredToProduction} en production. ${x.organizations.length} organisations contribuent.`;
    }
    default:
      return prefix + "Réponse disponible dans les données structurées.";
  }
}
