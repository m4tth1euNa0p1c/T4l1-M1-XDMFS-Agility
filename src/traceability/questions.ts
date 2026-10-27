import type { TraceGraph } from "./graph.js";
import { entityId, type CorrelationMethod, type Entity, type RelationStatus } from "./model.js";

/**
 * Business questions answered from the graph. Every answer carries its
 * sources and limitations. A path's status is the weakest status of its
 * links: verified + inferred = inferred.
 */

export interface SourceRef {
  entity: string;
  label: string;
  url?: string;
}

export interface Answer<T> {
  question: string;
  projectId: string;
  demo: boolean;
  data: T;
  sources: SourceRef[];
  limitations: string[];
}

export interface IssueLink {
  key: string;
  title: string;
  issueStatus: string;
  linkStatus: RelationStatus;
  methods: CorrelationMethod[];
  evidence: string[];
}

const RANK: Record<RelationStatus, number> = { unknown: 0, inferred: 1, verified: 2 };
const weakest = (a: RelationStatus, b: RelationStatus): RelationStatus =>
  RANK[a] <= RANK[b] ? a : b;
const strongestOf = (a: RelationStatus, b: RelationStatus): RelationStatus =>
  RANK[a] >= RANK[b] ? a : b;

const COMMON_LIMITS = [
  "Les liens ticket ↔ code reposent sur les clés Jira citées dans les branches, commits et PR : ils sont « inferred », jamais « verified ».",
];

function ref(e: Entity): SourceRef {
  return { entity: e.id, label: `${e.type} ${e.key}`, ...(e.url ? { url: e.url } : {}) };
}

function projectMeta(graph: TraceGraph, projectId: string): { demo: boolean } {
  const project = graph.getEntity(entityId("Project", projectId, projectId));
  return { demo: Boolean(project?.attributes.demo) };
}

function answer<T>(
  graph: TraceGraph,
  projectId: string,
  question: string,
  data: T,
  sources: SourceRef[],
  limitations: string[],
): Answer<T> {
  const { demo } = projectMeta(graph, projectId);
  const limits = demo
    ? [
        "Données de démonstration fictives : aucune source réelle n'a été interrogée.",
        ...limitations,
      ]
    : limitations;
  const seen = new Set<string>();
  const unique = sources.filter((s) => (seen.has(s.entity) ? false : (seen.add(s.entity), true)));
  return { question, projectId, demo, data, sources: unique, limitations: limits };
}

/** Issues reachable from a PR, with the best path status per issue. */
export function issuesForPullRequest(graph: TraceGraph, prId: string): IssueLink[] {
  const found = new Map<string, IssueLink>();
  const add = (
    issueId: string,
    status: RelationStatus,
    method: CorrelationMethod,
    evidence: string | undefined,
  ) => {
    const issue = graph.getEntity(issueId);
    if (!issue) return;
    const cur = found.get(issueId) ?? {
      key: issue.key,
      title: issue.title,
      issueStatus: String(issue.attributes.status ?? "Unknown"),
      linkStatus: "unknown" as RelationStatus,
      methods: [],
      evidence: [],
    };
    cur.linkStatus = strongestOf(cur.linkStatus, status);
    if (!cur.methods.includes(method)) cur.methods.push(method);
    if (evidence && !cur.evidence.includes(evidence)) cur.evidence.push(evidence);
    found.set(issueId, cur);
  };

  for (const r of graph.out(prId, "IMPLEMENTS")) add(r.to, r.status, r.method, r.evidence);
  for (const contains of graph.out(prId, "CONTAINS")) {
    for (const impl of graph.out(contains.to, "IMPLEMENTS")) {
      add(impl.to, weakest(contains.status, impl.status), impl.method, impl.evidence);
    }
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** PRs linked to an issue (any path) with path status. */
export function pullRequestsForIssue(
  graph: TraceGraph,
  projectId: string,
  issueKey: string,
): Array<{ pr: Entity; status: RelationStatus }> {
  const issueId = entityId("Issue", projectId, issueKey);
  return graph
    .allEntities("PullRequest")
    .filter((pr) => pr.projectId === projectId)
    .map((pr) => {
      const link = issuesForPullRequest(graph, pr.id).find((l) => l.key === issueKey);
      return link ? { pr, status: link.linkStatus } : null;
    })
    .filter(
      (x): x is { pr: Entity; status: RelationStatus } =>
        x !== null && graph.getEntity(issueId) !== undefined,
    );
}

/** Commits linked to an issue directly or through a PR. */
export function commitsForIssue(
  graph: TraceGraph,
  projectId: string,
  issueKey: string,
): Array<{ commit: Entity; status: RelationStatus }> {
  const issueId = entityId("Issue", projectId, issueKey);
  const out = new Map<string, RelationStatus>();
  for (const r of graph.in(issueId, "IMPLEMENTS")) {
    const from = graph.getEntity(r.from);
    if (from?.type === "Commit")
      out.set(from.id, strongestOf(out.get(from.id) ?? "unknown", r.status));
  }
  for (const { pr, status } of pullRequestsForIssue(graph, projectId, issueKey)) {
    for (const c of graph.out(pr.id, "CONTAINS")) {
      if (graph.getEntity(c.to)?.type !== "Commit") continue;
      out.set(c.to, strongestOf(out.get(c.to) ?? "unknown", weakest(status, c.status)));
    }
  }
  return [...out].map(([id, status]) => ({ commit: graph.getEntity(id)!, status }));
}

function buildsFor(graph: TraceGraph, commitId: string): Entity[] {
  return graph
    .in(commitId, "VALIDATES")
    .map((r) => graph.getEntity(r.from)!)
    .filter((e) => e.type === "Build");
}
function gatesFor(graph: TraceGraph, commitId: string): Entity[] {
  return graph
    .in(commitId, "VALIDATES")
    .map((r) => graph.getEntity(r.from)!)
    .filter((e) => e.type === "QualityGate");
}
function deploymentsFor(graph: TraceGraph, commitId: string): Entity[] {
  return graph.out(commitId, "DEPLOYED_IN").map((r) => graph.getEntity(r.to)!);
}
const isProd = (d: Entity) => /^prod/i.test(String(d.attributes.environment ?? ""));
const succeeded = (d: Entity) => d.attributes.status === "success";

// ---------------------------------------------------------------------------
// Q1. Quels tickets Jira sont associés à cette PR ?
export function ticketsForPullRequest(
  graph: TraceGraph,
  projectId: string,
  prNumber: number,
): Answer<{ pullRequest: string; title: string; issues: IssueLink[] } | null> {
  const pr = graph.getEntity(entityId("PullRequest", projectId, String(prNumber)));
  const q = `Quels tickets Jira sont associés à la PR #${prNumber} ?`;
  if (!pr)
    return answer(
      graph,
      projectId,
      q,
      null,
      [],
      [`PR #${prNumber} absente des données synchronisées.`],
    );
  const issues = issuesForPullRequest(graph, pr.id);
  const sources = [
    ref(pr),
    ...issues.map((i) => ref(graph.getEntity(entityId("Issue", projectId, i.key))!)),
  ];
  const limits = [...COMMON_LIMITS];
  if (issues.length === 0)
    limits.push(
      "Aucune clé Jira trouvée dans le titre, la description, la branche ou les commits de la PR.",
    );
  return answer(
    graph,
    projectId,
    q,
    { pullRequest: `#${prNumber}`, title: pr.title, issues },
    sources,
    limits,
  );
}

// Q2. Quels changements n'ont pas de ticket associé ?
export function changesWithoutTicket(graph: TraceGraph, projectId: string) {
  const prs = graph.allEntities("PullRequest").filter((p) => p.projectId === projectId);
  const prWithout = prs.filter((pr) => issuesForPullRequest(graph, pr.id).length === 0);
  const coveredByPr = new Set(
    prs
      .filter((pr) => issuesForPullRequest(graph, pr.id).length > 0)
      .flatMap((pr) => graph.out(pr.id, "CONTAINS").map((r) => r.to)),
  );
  const commitsWithout = graph
    .allEntities("Commit")
    .filter((c) => c.projectId === projectId)
    .filter((c) => graph.out(c.id, "IMPLEMENTS").length === 0 && !coveredByPr.has(c.id))
    .filter((c) => ((c.attributes.parents as string[] | undefined)?.length ?? 0) <= 1);
  const deployedInProd = commitsWithout.filter((c) =>
    deploymentsFor(graph, c.id).some((d) => isProd(d) && succeeded(d)),
  );
  return answer(
    graph,
    projectId,
    "Quels changements n'ont pas de ticket associé ?",
    {
      pullRequests: prWithout.map((p) => ({
        number: Number(p.key),
        title: p.title,
        author: p.attributes.author,
        url: p.url,
      })),
      commits: commitsWithout.map((c) => ({
        sha: c.key.slice(0, 7),
        message: c.title,
        author: c.attributes.author,
        deployedInProduction: deployedInProd.includes(c),
      })),
      deployedInProductionWithoutTicket: deployedInProd.length,
    },
    [...prWithout.map(ref), ...commitsWithout.map(ref)],
    [...COMMON_LIMITS, "Les commits de merge sont exclus : ils héritent des tickets de leur PR."],
  );
}

// Q3. Quelles PR n'ont pas de contrôle qualité vérifié ?
export function pullRequestsWithoutQualityCheck(graph: TraceGraph, projectId: string) {
  const rows = graph
    .allEntities("PullRequest")
    .filter((p) => p.projectId === projectId)
    .map((pr) => {
      const head = entityId("Commit", projectId, String(pr.attributes.headSha));
      const builds = buildsFor(graph, head);
      const gates = gatesFor(graph, head);
      const ciOk = builds.some((b) => b.attributes.conclusion === "success");
      const gate = gates.sort((a, b) =>
        String(b.attributes.date).localeCompare(String(a.attributes.date)),
      )[0];
      const problems: string[] = [];
      if (builds.length === 0) problems.push("aucun build CI sur le commit de tête");
      else if (!ciOk) problems.push("build CI en échec");
      if (!gate) problems.push("aucune analyse SonarQube sur le commit de tête");
      else if (gate.attributes.status === "ERROR") problems.push("quality gate SonarQube en échec");
      return {
        pr,
        ciOk,
        gateStatus: gate ? String(gate.attributes.status) : "NONE",
        problems,
        builds,
        gate,
      };
    })
    .filter((r) => r.problems.length > 0);
  return answer(
    graph,
    projectId,
    "Quelles PR n'ont pas de contrôle qualité vérifié ?",
    rows.map((r) => ({
      number: Number(r.pr.key),
      title: r.pr.title,
      state: r.pr.attributes.merged ? "merged" : r.pr.attributes.state,
      ci: r.ciOk ? "success" : r.builds.length ? "failure" : "absent",
      qualityGate: r.gateStatus,
      problems: r.problems,
    })),
    rows.flatMap((r) => [ref(r.pr), ...r.builds.map(ref), ...(r.gate ? [ref(r.gate)] : [])]),
    [
      "Le contrôle est évalué sur le commit de tête de la PR (head SHA).",
      "SonarQube Community n'analyse que la branche principale : l'absence d'analyse sur une PR peut venir de l'édition, pas d'un oubli.",
      "Une quality gate réussie ne vaut pas validation fonctionnelle.",
    ],
  );
}

// Q4. Quels tickets sont bloqués par une analyse SonarQube ?
export function issuesBlockedByQuality(graph: TraceGraph, projectId: string) {
  const rows: Array<{
    key: string;
    title: string;
    status: string;
    pullRequest: number;
    gate: string;
    failedConditions: unknown;
    linkStatus: RelationStatus;
  }> = [];
  const sources: SourceRef[] = [];
  for (const pr of graph.allEntities("PullRequest").filter((p) => p.projectId === projectId)) {
    const blockers = graph
      .in(pr.id, "BLOCKS")
      .map((r) => graph.getEntity(r.from)!)
      .filter((e) => e.type === "QualityGate");
    if (blockers.length === 0) continue;
    for (const link of issuesForPullRequest(graph, pr.id)) {
      for (const gate of blockers) {
        const conditions =
          (gate.attributes.conditions as Array<{ status: string }> | undefined) ?? [];
        rows.push({
          key: link.key,
          title: link.title,
          status: link.issueStatus,
          pullRequest: Number(pr.key),
          gate: gate.key,
          failedConditions: conditions.filter((c) => c.status === "ERROR"),
          linkStatus: link.linkStatus,
        });
        sources.push(ref(pr), ref(gate));
      }
    }
  }
  return answer(
    graph,
    projectId,
    "Quels tickets sont bloqués par une analyse SonarQube ?",
    rows,
    sources,
    [
      ...COMMON_LIMITS,
      "Le blocage est établi quand la quality gate du commit de tête d'une PR est en ERROR.",
    ],
  );
}

// Q5. Quels changements sont réellement déployés ?
export function deployedChanges(graph: TraceGraph, projectId: string, environment = "production") {
  const deployments = graph
    .allEntities("Deployment")
    .filter(
      (d) =>
        d.projectId === projectId &&
        String(d.attributes.environment).toLowerCase() === environment.toLowerCase() &&
        succeeded(d),
    )
    .sort((a, b) => String(b.attributes.createdAt).localeCompare(String(a.attributes.createdAt)));
  const latest = deployments[0];
  const deployedCommits = new Set(
    latest ? graph.in(latest.id, "DEPLOYED_IN").map((r) => r.from) : [],
  );
  const issues = graph
    .allEntities("Issue")
    .filter((i) => i.projectId === projectId && !i.attributes.missing)
    .map((issue) => {
      const commits = commitsForIssue(graph, projectId, issue.key);
      const deployed = commits.filter((c) => deployedCommits.has(c.commit.id));
      return { issue, deployed, total: commits.length };
    })
    .filter((x) => x.deployed.length > 0);
  return answer(
    graph,
    projectId,
    `Quels changements sont réellement déployés en ${environment} ?`,
    {
      environment,
      deployment: latest
        ? {
            id: latest.key,
            sha: String(latest.attributes.sha).slice(0, 7),
            date: latest.attributes.createdAt,
            url: latest.url,
          }
        : null,
      commitsDeployed: deployedCommits.size,
      issues: issues.map((x) => ({
        key: x.issue.key,
        title: x.issue.title,
        status: x.issue.attributes.status,
        commitsDeployed: x.deployed.length,
        commitsLinked: x.total,
        linkStatus: x.deployed.some((d) => d.status === "verified") ? "verified" : "inferred",
      })),
    },
    [...(latest ? [ref(latest)] : []), ...issues.map((x) => ref(x.issue))],
    latest
      ? [
          ...COMMON_LIMITS,
          "Le commit déployé est vérifié par l'enregistrement de déploiement ; ses ancêtres par l'historique Git.",
          "Un workflow CI réussi n'est jamais compté comme un déploiement.",
        ]
      : [`Aucun déploiement réussi enregistré pour l'environnement ${environment}.`],
  );
}

// Q6. Chaîne de livraison d'un ticket et informations manquantes.
export function issueDeliveryChain(graph: TraceGraph, projectId: string, issueKey: string) {
  const issue = graph.getEntity(entityId("Issue", projectId, issueKey));
  const q = `Quelle est la chaîne de livraison du ticket ${issueKey} ?`;
  if (!issue)
    return answer(
      graph,
      projectId,
      q,
      null,
      [],
      [`Ticket ${issueKey} absent des données synchronisées.`],
    );

  const prs = pullRequestsForIssue(graph, projectId, issueKey);
  const commits = commitsForIssue(graph, projectId, issueKey);
  const branches = graph
    .in(issue.id, "IMPLEMENTS")
    .map((r) => graph.getEntity(r.from)!)
    .filter((e) => e.type === "Branch");
  const heads = prs.map(({ pr }) => entityId("Commit", projectId, String(pr.attributes.headSha)));
  const builds = heads.flatMap((h) => buildsFor(graph, h));
  const gates = heads.flatMap((h) => gatesFor(graph, h));
  const mergeShas = prs.map(({ pr }) => pr.attributes.mergeCommitSha).filter(Boolean) as string[];
  const mainGates = mergeShas.flatMap((s) => gatesFor(graph, entityId("Commit", projectId, s)));
  const deployments = [...new Set(commits.flatMap((c) => deploymentsFor(graph, c.commit.id)))];
  const prodOk = deployments.filter((d) => isProd(d) && succeeded(d));
  const inProd = new Set(prodOk.flatMap((d) => graph.in(d.id, "DEPLOYED_IN").map((r) => r.from)));
  const notInProd = commits.filter((c) => !inProd.has(c.commit.id));
  const partiallyDelivered = prodOk.length > 0 && notInProd.length > 0;

  const missing: string[] = [];
  if (branches.length === 0) missing.push("Aucune branche ne cite la clé du ticket.");
  if (commits.length === 0) missing.push("Aucun commit relié au ticket.");
  if (prs.length === 0) missing.push("Aucune pull request reliée au ticket.");
  if (prs.length > 0 && !prs.some(({ pr }) => pr.attributes.merged))
    missing.push("Aucune PR fusionnée.");
  if (prs.length > 0 && builds.length === 0)
    missing.push("Aucun build CI sur le commit de tête des PR.");
  if (builds.length > 0 && !builds.some((b) => b.attributes.conclusion === "success"))
    missing.push("Aucun build CI réussi.");
  if (gates.length + mainGates.length === 0)
    missing.push("Aucune analyse SonarQube rattachée aux commits du ticket.");
  if ([...gates, ...mainGates].some((g) => g.attributes.status === "ERROR"))
    missing.push("Une quality gate SonarQube est en échec.");
  if (prodOk.length === 0)
    missing.push("Aucun déploiement réussi en production ne contient les commits du ticket.");
  if (partiallyDelivered)
    missing.push(
      `Livraison partielle : ${notInProd.length} commit(s) relié(s) au ticket ne sont pas encore en production.`,
    );
  if (String(issue.attributes.statusCategory) === "done" && prodOk.length === 0)
    missing.push(
      "Le ticket est « Terminé » dans Jira mais sa livraison en production n'est pas prouvée.",
    );

  const status = (s: RelationStatus) => s;
  return answer(
    graph,
    projectId,
    q,
    {
      issue: {
        key: issue.key,
        title: issue.title,
        status: issue.attributes.status,
        assignee: issue.attributes.assignee,
        sprint: issue.attributes.sprint,
      },
      branches: branches.map((b) => ({ name: b.key, linkStatus: status("inferred") })),
      commits: commits.map((c) => ({
        sha: c.commit.key.slice(0, 7),
        message: c.commit.title,
        author: c.commit.attributes.author,
        linkStatus: c.status,
      })),
      pullRequests: prs.map(({ pr, status: s }) => ({
        number: Number(pr.key),
        title: pr.title,
        merged: pr.attributes.merged,
        linkStatus: s,
        url: pr.url,
      })),
      builds: builds.map((b) => ({
        id: b.key,
        name: b.title,
        conclusion: b.attributes.conclusion,
        linkStatus: "verified",
      })),
      qualityGates: [...gates, ...mainGates].map((g) => ({
        analysis: g.key,
        status: g.attributes.status,
        branch: g.attributes.branch,
        linkStatus: "verified",
      })),
      deployments: deployments.map((d) => ({
        id: d.key,
        environment: d.attributes.environment,
        status: d.attributes.status,
        date: d.attributes.createdAt,
        linkStatus: "verified",
      })),
      deliveredToProduction: prodOk.length > 0,
      partiallyDelivered,
      commitsNotInProduction: notInProd.map((c) => c.commit.key.slice(0, 7)),
      missing,
    },
    [
      ref(issue),
      ...prs.map(({ pr }) => ref(pr)),
      ...builds.map(ref),
      ...gates.map(ref),
      ...deployments.map(ref),
    ],
    [...COMMON_LIMITS, "Chaque étape hérite du statut de son lien le plus faible avec le ticket."],
  );
}

// Q7. Quelles informations manquent pour confirmer une livraison ?
export function missingDeliveryInformation(graph: TraceGraph, projectId: string) {
  const rows = graph
    .allEntities("Issue")
    .filter(
      (i) =>
        i.projectId === projectId && !i.attributes.missing && i.attributes.statusCategory !== "new",
    )
    .map((i) => {
      const chain = issueDeliveryChain(graph, projectId, i.key).data;
      return chain
        ? { key: i.key, title: i.title, status: i.attributes.status, missing: chain.missing }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.missing.length > 0);
  const unsynced = graph
    .allEntities("Issue")
    .filter((i) => i.projectId === projectId && i.attributes.missing);
  return answer(
    graph,
    projectId,
    "Quelles informations manquent pour confirmer une livraison ?",
    { issues: rows, unsyncedReferencedTickets: unsynced.map((i) => i.key) },
    rows.map((r) => ({ entity: entityId("Issue", projectId, r.key), label: `Issue ${r.key}` })),
    [...COMMON_LIMITS, "Les tickets « À faire » sont exclus : rien n'est attendu pour eux."],
  );
}

// Q8. Risques de release.
export function releaseRisks(graph: TraceGraph, projectId: string) {
  const risks: Array<{
    severity: "high" | "medium" | "low";
    kind: string;
    message: string;
    refs: string[];
  }> = [];
  for (const i of graph
    .allEntities("Issue")
    .filter((x) => x.projectId === projectId && !x.attributes.missing)) {
    const chain = issueDeliveryChain(graph, projectId, i.key).data;
    if (!chain) continue;
    if (i.attributes.statusCategory === "done" && !chain.deliveredToProduction) {
      risks.push({
        severity: "high",
        kind: "done_not_deployed",
        message: `${i.key} est terminé dans Jira mais non prouvé en production.`,
        refs: [i.id],
      });
    } else if (i.attributes.statusCategory === "done" && chain.partiallyDelivered) {
      risks.push({
        severity: "medium",
        kind: "partially_deployed",
        message: `${i.key} est terminé mais seulement en partie en production (${chain.commitsNotInProduction.length} commit(s) en attente).`,
        refs: [i.id],
      });
    }
  }
  for (const gate of graph
    .allEntities("QualityGate")
    .filter((g) => g.projectId === projectId && g.attributes.status === "ERROR")) {
    for (const r of graph.out(gate.id, "BLOCKS")) {
      const pr = graph.getEntity(r.to)!;
      if (pr.attributes.merged)
        risks.push({
          severity: "high",
          kind: "merged_with_failed_gate",
          message: `PR #${pr.key} fusionnée malgré une quality gate en échec.`,
          refs: [pr.id, gate.id],
        });
    }
  }
  for (const r of graph
    .allRelations()
    .filter((x) => x.type === "BLOCKS" && x.from.startsWith("Issue:"))) {
    const blocker = graph.getEntity(r.from)!;
    const blocked = graph.getEntity(r.to)!;
    if (blocker.projectId === projectId && blocker.attributes.statusCategory !== "done") {
      risks.push({
        severity: "medium",
        kind: "blocked_issue",
        message: `${blocked.key} est bloqué par ${blocker.key} (${String(blocker.attributes.status)}).`,
        refs: [blocker.id, blocked.id],
      });
    }
  }
  for (const d of graph
    .allEntities("Deployment")
    .filter((x) => x.projectId === projectId && x.attributes.status === "failure")) {
    risks.push({
      severity: "medium",
      kind: "failed_deployment",
      message: `Déploiement ${d.title} en échec.`,
      refs: [d.id],
    });
  }
  const noTicket = changesWithoutTicket(graph, projectId).data;
  if (noTicket.deployedInProductionWithoutTicket > 0) {
    risks.push({
      severity: "medium",
      kind: "untracked_in_production",
      message: `${noTicket.deployedInProductionWithoutTicket} commit(s) sans ticket sont en production.`,
      refs: [],
    });
  }
  for (const pr of noTicket.pullRequests) {
    risks.push({
      severity: "low",
      kind: "pr_without_ticket",
      message: `PR #${pr.number} sans ticket associé.`,
      refs: [entityId("PullRequest", projectId, String(pr.number))],
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => order[a.severity] - order[b.severity]);
  return answer(
    graph,
    projectId,
    "Quels sont les risques pour la prochaine release ?",
    risks,
    [],
    COMMON_LIMITS,
  );
}

// Vue d'ensemble pour le tableau de bord.
export function projectOverview(graph: TraceGraph, projectId: string) {
  const project = graph.getEntity(entityId("Project", projectId, projectId));
  const issues = graph
    .allEntities("Issue")
    .filter((i) => i.projectId === projectId && !i.attributes.missing);
  const commits = graph.allEntities("Commit").filter((c) => c.projectId === projectId);
  const members =
    (project?.attributes.members as
      Array<{ login: string; name: string; organization: string; role: string }> | undefined) ?? [];
  const orgs =
    (project?.attributes.organizations as
      Array<{ id: string; name: string; role: string }> | undefined) ?? [];
  const orgOf = new Map(members.map((m) => [m.login, m.organization]));
  const commitsByOrg: Record<string, number> = {};
  for (const c of commits) {
    const org = orgOf.get(String(c.attributes.author)) ?? "inconnu";
    commitsByOrg[org] = (commitsByOrg[org] ?? 0) + 1;
  }
  const bySprint: Record<
    string,
    { total: number; done: number; points: number; donePoints: number }
  > = {};
  for (const i of issues) {
    const s = String(i.attributes.sprint ?? "Backlog");
    const row = (bySprint[s] ??= { total: 0, done: 0, points: 0, donePoints: 0 });
    row.total += 1;
    row.points += Number(i.attributes.storyPoints ?? 0);
    if (i.attributes.statusCategory === "done") {
      row.done += 1;
      row.donePoints += Number(i.attributes.storyPoints ?? 0);
    }
  }
  const delivered = deployedChanges(graph, projectId).data.issues.length;
  return answer(
    graph,
    projectId,
    "Vue d'ensemble du projet",
    {
      project: project
        ? { id: projectId, name: project.title, description: project.attributes.description }
        : null,
      organizations: orgs,
      members,
      stats: graph.stats(),
      issues: {
        total: issues.length,
        done: issues.filter((i) => i.attributes.statusCategory === "done").length,
        inProgress: issues.filter((i) => i.attributes.statusCategory === "indeterminate").length,
        todo: issues.filter((i) => i.attributes.statusCategory === "new").length,
        deliveredToProduction: delivered,
      },
      commitsByOrganization: commitsByOrg,
      sprints: bySprint,
    },
    project ? [ref(project)] : [],
    [],
  );
}
