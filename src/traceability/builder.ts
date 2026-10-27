import { TraceGraph } from "./graph.js";
import {
  INFERENCE_CONFIDENCE,
  entityId,
  type CorrelationMethod,
  type DataSource,
  type Relation,
  type RelationType,
} from "./model.js";
import { SyncSnapshotSchema, type SyncSnapshot, type SyncSnapshotInput } from "./snapshot.js";

/**
 * Extracts issue keys (ABC-123) from free text, restricted to the known
 * Jira project keys so that strings like "UTF-8" or "ISO-27001" are not
 * mistaken for tickets.
 */
export function extractIssueKeys(text: string, projectKeys: readonly string[]): string[] {
  if (!text || projectKeys.length === 0) return [];
  const allowed = new Set(projectKeys);
  const found = new Set<string>();
  for (const m of text.matchAll(
    /(?<![A-Za-z0-9])([A-Z][A-Z0-9_]{1,9})-(\d{1,7})(?![A-Za-z0-9])/g,
  )) {
    if (allowed.has(m[1]!)) found.add(`${m[1]}-${m[2]}`);
  }
  // Branch names are often lower-case: feature/pay-12-virement.
  for (const m of text.matchAll(/(?<![A-Za-z0-9])([a-z][a-z0-9_]{1,9})-(\d{1,7})(?![0-9])/g)) {
    const key = m[1]!.toUpperCase();
    if (allowed.has(key)) found.add(`${key}-${m[2]}`);
  }
  return [...found];
}

/** Builds a graph from a snapshot. Pure: same snapshot => same graph. */
export function buildGraph(
  input: SyncSnapshotInput,
  graph: TraceGraph = new TraceGraph(),
): TraceGraph {
  const snap: SyncSnapshot = SyncSnapshotSchema.parse(input);
  const p = snap.project;
  const at = snap.observedAt;
  const src = (real: Exclude<DataSource, "demo">): DataSource => (p.demo ? "demo" : real);
  const id = {
    project: entityId("Project", p.id, p.id),
    issue: (k: string) => entityId("Issue", p.id, k),
    commit: (s: string) => entityId("Commit", p.id, s),
    branch: (b: string) => entityId("Branch", p.id, b),
    pr: (n: number) => entityId("PullRequest", p.id, String(n)),
    build: (n: number) => entityId("Build", p.id, String(n)),
    gate: (a: string) => entityId("QualityGate", p.id, a),
    deploy: (n: number) => entityId("Deployment", p.id, String(n)),
    release: (t: string) => entityId("Release", p.id, t),
  };

  const verified = (
    type: RelationType,
    from: string,
    to: string,
    method: CorrelationMethod,
    source: DataSource,
    sourceObjectId: string,
    evidence: string,
  ): Relation =>
    graph.addRelation({
      type,
      from,
      to,
      status: "verified",
      method,
      confidence: 1,
      source,
      sourceObjectId,
      observedAt: at,
      evidence,
    });

  const inferred = (
    type: RelationType,
    from: string,
    to: string,
    method: CorrelationMethod,
    source: DataSource,
    sourceObjectId: string,
    evidence: string,
  ): Relation =>
    graph.addRelation({
      type,
      from,
      to,
      status: "inferred",
      method,
      confidence: INFERENCE_CONFIDENCE[method] ?? 0.5,
      source,
      sourceObjectId,
      observedAt: at,
      evidence,
    });

  graph.addEntity({
    id: id.project,
    type: "Project",
    projectId: p.id,
    key: p.id,
    title: p.name,
    attributes: {
      description: p.description,
      demo: p.demo,
      organizations: p.organizations,
      members: p.members,
    },
    source: p.demo ? "demo" : "manual",
    observedAt: at,
  });

  // Issues
  const knownIssues = new Set(snap.issues.map((i) => i.key));
  for (const issue of snap.issues) {
    graph.addEntity({
      id: id.issue(issue.key),
      type: "Issue",
      projectId: p.id,
      key: issue.key,
      title: issue.summary,
      attributes: {
        type: issue.type,
        status: issue.status,
        statusCategory: issue.statusCategory,
        assignee: issue.assignee,
        sprint: issue.sprint,
        storyPoints: issue.storyPoints,
        priority: issue.priority,
        created: issue.created,
        updated: issue.updated,
      },
      source: src("jira"),
      ...(issue.url ? { url: issue.url } : {}),
      observedAt: at,
    });
    verified(
      "CONTAINS",
      id.project,
      id.issue(issue.key),
      "api_explicit_link",
      src("jira"),
      issue.key,
      issue.url ?? `jira:${issue.key}`,
    );
  }
  for (const issue of snap.issues) {
    for (const link of issue.links) {
      if (!knownIssues.has(link.key) || !/block/i.test(link.type)) continue;
      // Store BLOCKS in the "blocker -> blocked" direction.
      const [blocker, blocked] =
        link.direction === "outward" ? [issue.key, link.key] : [link.key, issue.key];
      verified(
        "BLOCKS",
        id.issue(blocker),
        id.issue(blocked),
        "jira_issue_link",
        src("jira"),
        issue.key,
        issue.url ?? `jira:${issue.key}#links`,
      );
    }
  }

  const linkIssues = (
    from: string,
    text: string,
    method: CorrelationMethod,
    source: DataSource,
    objectId: string,
    evidence: string,
  ) => {
    for (const key of extractIssueKeys(text, p.jiraProjectKeys)) {
      if (!knownIssues.has(key)) {
        // Referenced ticket that is not in the synced data: keep the gap visible.
        graph.addEntity({
          id: id.issue(key),
          type: "Issue",
          projectId: p.id,
          key,
          title: "(ticket non synchronisé)",
          attributes: { status: "Unknown", statusCategory: "undefined", missing: true },
          source,
          observedAt: at,
        });
      }
      inferred("IMPLEMENTS", from, id.issue(key), method, source, objectId, evidence);
    }
  };

  // Commits
  const commitBySha = new Map(snap.commits.map((c) => [c.sha, c]));
  for (const c of snap.commits) {
    graph.addEntity({
      id: id.commit(c.sha),
      type: "Commit",
      projectId: p.id,
      key: c.sha,
      title: c.message.split("\n")[0] ?? "",
      attributes: { author: c.author, date: c.date, parents: c.parents, message: c.message },
      source: src("github"),
      ...(c.url ? { url: c.url } : {}),
      observedAt: at,
    });
    linkIssues(
      id.commit(c.sha),
      c.message,
      "commit_message_key",
      src("github"),
      c.sha,
      c.url ?? `commit:${c.sha}`,
    );
  }

  // Pull requests and branches
  for (const pr of snap.pullRequests) {
    const prId = id.pr(pr.number);
    graph.addEntity({
      id: prId,
      type: "PullRequest",
      projectId: p.id,
      key: String(pr.number),
      title: pr.title,
      attributes: {
        state: pr.state,
        merged: pr.merged,
        author: pr.author,
        headRef: pr.headRef,
        baseRef: pr.baseRef,
        headSha: pr.headSha,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        mergeCommitSha: pr.mergeCommitSha,
        reviewers: pr.reviewers,
      },
      source: src("github"),
      ...(pr.url ? { url: pr.url } : {}),
      observedAt: at,
    });
    const branchId = id.branch(pr.headRef);
    graph.addEntity({
      id: branchId,
      type: "Branch",
      projectId: p.id,
      key: pr.headRef,
      title: pr.headRef,
      attributes: { base: pr.baseRef },
      source: src("github"),
      observedAt: at,
    });
    const prEvidence = pr.url ?? `pull:${pr.number}`;
    verified(
      "CONTAINS",
      prId,
      branchId,
      "api_explicit_link",
      src("github"),
      String(pr.number),
      prEvidence,
    );
    for (const sha of pr.commits) {
      if (!commitBySha.has(sha)) continue;
      verified(
        "CONTAINS",
        prId,
        id.commit(sha),
        "api_explicit_link",
        src("github"),
        String(pr.number),
        `${prEvidence}/commits`,
      );
      verified(
        "CONTAINS",
        branchId,
        id.commit(sha),
        "api_explicit_link",
        src("github"),
        String(pr.number),
        `${prEvidence}/commits`,
      );
    }
    if (pr.mergeCommitSha && commitBySha.has(pr.mergeCommitSha)) {
      verified(
        "CONTAINS",
        prId,
        id.commit(pr.mergeCommitSha),
        "api_explicit_link",
        src("github"),
        String(pr.number),
        prEvidence,
      );
    }
    linkIssues(prId, pr.title, "pr_title_key", src("github"), String(pr.number), prEvidence);
    linkIssues(prId, pr.body, "pr_body_key", src("github"), String(pr.number), prEvidence);
    linkIssues(branchId, pr.headRef, "branch_name_key", src("github"), pr.headRef, prEvidence);
  }

  // CI runs: VALIDATES is verified by head SHA; success is an attribute.
  for (const run of snap.workflowRuns) {
    graph.addEntity({
      id: id.build(run.id),
      type: "Build",
      projectId: p.id,
      key: String(run.id),
      title: run.name,
      attributes: {
        status: run.status,
        conclusion: run.conclusion,
        headSha: run.headSha,
        headBranch: run.headBranch,
        event: run.event,
        createdAt: run.createdAt,
      },
      source: src("github"),
      ...(run.url ? { url: run.url } : {}),
      observedAt: at,
    });
    if (commitBySha.has(run.headSha)) {
      verified(
        "VALIDATES",
        id.build(run.id),
        id.commit(run.headSha),
        "ci_head_sha",
        src("github"),
        String(run.id),
        run.url ?? `run:${run.id}`,
      );
    }
  }

  // SonarQube analyses
  for (const gate of snap.qualityGates) {
    graph.addEntity({
      id: id.gate(gate.analysisId),
      type: "QualityGate",
      projectId: p.id,
      key: gate.analysisId,
      title: `Quality gate ${gate.status}`,
      attributes: {
        status: gate.status,
        revision: gate.revision,
        branch: gate.branch,
        date: gate.date,
        conditions: gate.conditions,
        measures: gate.measures,
      },
      source: src("sonarqube"),
      ...(gate.url ? { url: gate.url } : {}),
      observedAt: at,
    });
    if (gate.revision && commitBySha.has(gate.revision)) {
      const evidence = gate.url ?? `sonar:${gate.analysisId}`;
      verified(
        "VALIDATES",
        id.gate(gate.analysisId),
        id.commit(gate.revision),
        "sonar_analysis_revision",
        src("sonarqube"),
        gate.analysisId,
        evidence,
      );
      if (gate.status === "ERROR") {
        for (const pr of snap.pullRequests.filter((x) => x.headSha === gate.revision)) {
          verified(
            "BLOCKS",
            id.gate(gate.analysisId),
            id.pr(pr.number),
            "sonar_analysis_revision",
            src("sonarqube"),
            gate.analysisId,
            evidence,
          );
        }
      }
    }
  }

  // Deployments: the deployed SHA and all its known ancestors.
  const ancestors = (sha: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [sha];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur) || !commitBySha.has(cur)) continue;
      seen.add(cur);
      stack.push(...commitBySha.get(cur)!.parents);
    }
    return seen;
  };
  for (const d of snap.deployments) {
    graph.addEntity({
      id: id.deploy(d.id),
      type: "Deployment",
      projectId: p.id,
      key: String(d.id),
      title: `${d.environment} #${d.id}`,
      attributes: {
        environment: d.environment,
        status: d.status,
        sha: d.sha,
        createdAt: d.createdAt,
        actor: d.actor,
      },
      source: src("github"),
      ...(d.url ? { url: d.url } : {}),
      observedAt: at,
    });
    const evidence = d.url ?? `deployment:${d.id}`;
    for (const sha of ancestors(d.sha)) {
      const method: CorrelationMethod = sha === d.sha ? "deployment_sha" : "git_ancestry";
      verified(
        "DEPLOYED_IN",
        id.commit(sha),
        id.deploy(d.id),
        method,
        src("github"),
        String(d.id),
        evidence,
      );
    }
  }

  for (const r of snap.releases) {
    graph.addEntity({
      id: id.release(r.tag),
      type: "Release",
      projectId: p.id,
      key: r.tag,
      title: r.tag,
      attributes: { sha: r.sha, date: r.date },
      source: src("github"),
      ...(r.url ? { url: r.url } : {}),
      observedAt: at,
    });
    for (const sha of ancestors(r.sha)) {
      verified(
        "CONTAINS",
        id.release(r.tag),
        id.commit(sha),
        "git_ancestry",
        src("github"),
        r.tag,
        r.url ?? `release:${r.tag}`,
      );
    }
  }

  return graph;
}
