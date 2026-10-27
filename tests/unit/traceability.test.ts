import { describe, expect, it } from "vitest";
import { answerDeterministic, routeQuestion } from "../../src/assistant/router.js";
import { buildBankDemoSnapshot } from "../../src/demo/bank-project.js";
import { buildGraph, extractIssueKeys } from "../../src/traceability/builder.js";
import { TraceGraph } from "../../src/traceability/graph.js";
import { RelationSchema, VERIFYING_METHODS } from "../../src/traceability/model.js";
import * as Q from "../../src/traceability/questions.js";
import type { SyncSnapshotInput } from "../../src/traceability/snapshot.js";

const P = "aurore-pay";
const graph = buildGraph(buildBankDemoSnapshot());
const AT = "2026-10-27T09:00:00+01:00";

describe("extractIssueKeys", () => {
  it("finds known keys, upper or lower case, and ignores look-alikes", () => {
    expect(extractIssueKeys("feat: x (PAY-12) see PAY-3", ["PAY"]).sort()).toEqual([
      "PAY-12",
      "PAY-3",
    ]);
    expect(extractIssueKeys("feature/pay-16-iban", ["PAY"])).toEqual(["PAY-16"]);
    expect(extractIssueKeys("encodage UTF-8 et ISO-27001", ["PAY"])).toEqual([]);
    expect(extractIssueKeys("XPAY-1 PAY-1x", ["PAY"])).toEqual([]);
  });
});

describe("relation invariants", () => {
  const base = {
    type: "IMPLEMENTS" as const,
    from: "a",
    to: "b",
    source: "github" as const,
    sourceObjectId: "x",
    observedAt: AT,
  };
  it("rejects verified relations from a convention-based method", () => {
    expect(() =>
      RelationSchema.parse({
        ...base,
        status: "verified",
        method: "commit_message_key",
        confidence: 1,
        evidence: "e",
      }),
    ).toThrow();
  });
  it("rejects verified relations without evidence", () => {
    expect(() =>
      RelationSchema.parse({
        ...base,
        status: "verified",
        method: "api_explicit_link",
        confidence: 1,
      }),
    ).toThrow();
  });
  it("rejects inferred relations with full confidence", () => {
    expect(() =>
      RelationSchema.parse({
        ...base,
        status: "inferred",
        method: "branch_name_key",
        confidence: 1,
      }),
    ).toThrow();
  });
  it("every verified relation of the demo uses a verifying method and has evidence", () => {
    for (const r of graph.allRelations().filter((x) => x.status === "verified")) {
      expect(VERIFYING_METHODS.has(r.method)).toBe(true);
      expect(r.evidence).toBeTruthy();
    }
  });
  it("issue <-> code links are never verified", () => {
    const implementsLinks = graph.allRelations().filter((r) => r.type === "IMPLEMENTS");
    expect(implementsLinks.length).toBeGreaterThan(0);
    expect(implementsLinks.every((r) => r.status === "inferred")).toBe(true);
  });
});

describe("graph deduplication", () => {
  it("building twice into the same graph does not duplicate", () => {
    const g = new TraceGraph();
    buildGraph(buildBankDemoSnapshot(), g);
    const before = g.stats();
    buildGraph(buildBankDemoSnapshot(), g);
    expect(g.stats()).toEqual(before);
  });
  it("demo generator is deterministic", () => {
    expect(JSON.stringify(buildBankDemoSnapshot())).toBe(JSON.stringify(buildBankDemoSnapshot()));
  });
});

describe("business questions on the bank demo", () => {
  it("Q1 tickets for PR #13 -> PAY-7, inferred, with evidence", () => {
    const a = Q.ticketsForPullRequest(graph, P, 13);
    expect(a.demo).toBe(true);
    expect(a.limitations[0]).toMatch(/fictives/);
    expect(a.data?.issues).toHaveLength(1);
    expect(a.data?.issues[0]).toMatchObject({ key: "PAY-7", linkStatus: "inferred" });
    expect(a.data?.issues[0]!.evidence.length).toBeGreaterThan(0);
  });
  it("Q1 PR linked only through its body and branch (#7 -> PAY-10, #11 -> PAY-16)", () => {
    expect(Q.ticketsForPullRequest(graph, P, 7).data?.issues.map((i) => i.key)).toEqual(["PAY-10"]);
    const pr11 = Q.ticketsForPullRequest(graph, P, 11).data?.issues[0];
    // No key in the PR title or commits: only the branch name (and the merge
    // commit message, which repeats it) link PR #11 to PAY-16.
    expect(pr11?.key).toBe("PAY-16");
    expect(pr11?.methods).toContain("branch_name_key");
    expect(pr11?.methods).not.toContain("pr_title_key");
    expect(pr11?.linkStatus).toBe("inferred");
  });
  it("Q1 unknown PR returns null data with an explanation", () => {
    expect(Q.ticketsForPullRequest(graph, P, 999).data).toBeNull();
  });
  it("Q2 changes without ticket", () => {
    const d = Q.changesWithoutTicket(graph, P).data;
    expect(d.pullRequests.map((p) => p.number)).toEqual([15]);
    expect(d.commits.map((c) => c.message)).toContain("chore: mise à jour des dépendances");
    expect(d.deployedInProductionWithoutTicket).toBe(2);
  });
  it("Q3 PRs without verified quality control", () => {
    const rows = Q.pullRequestsWithoutQualityCheck(graph, P).data;
    expect(rows.map((r) => r.number).sort((a, b) => a - b)).toEqual([5, 9, 13, 15]);
    expect(rows.find((r) => r.number === 15)!.problems).toContain("build CI en échec");
  });
  it("Q4 tickets blocked by SonarQube", () => {
    expect(
      Q.issuesBlockedByQuality(graph, P)
        .data.map((r) => r.key)
        .sort(),
    ).toEqual(["PAY-5", "PAY-7"]);
  });
  it("Q5 deployed changes use the latest successful production deployment", () => {
    const d = Q.deployedChanges(graph, P).data;
    expect(d.deployment?.id).toBe("708");
    const keys = d.issues.map((i) => i.key);
    expect(keys).toContain("PAY-17");
    expect(keys).not.toContain("PAY-7");
    expect(keys).not.toContain("PAY-18");
  });
  it("Q5 staging differs from production", () => {
    const staging = Q.deployedChanges(graph, P, "staging").data;
    const pay6 = staging.issues.find((i) => i.key === "PAY-6")!;
    expect(pay6.commitsDeployed).toBe(pay6.commitsLinked);
  });
  it("Q6 delivery chain shows partial delivery for PAY-6", () => {
    const d = Q.issueDeliveryChain(graph, P, "PAY-6").data!;
    expect(d.deliveredToProduction).toBe(true);
    expect(d.partiallyDelivered).toBe(true);
    expect(d.missing.join(" ")).toMatch(/Livraison partielle/);
  });
  it("Q6 PAY-18 is done in Jira without any evidence", () => {
    const d = Q.issueDeliveryChain(graph, P, "PAY-18").data!;
    expect(d.commits).toHaveLength(0);
    expect(d.missing).toContain(
      "Le ticket est « Terminé » dans Jira mais sa livraison en production n'est pas prouvée.",
    );
  });
  it("Q6 a clean chain has no gap (PAY-2)", () => {
    const d = Q.issueDeliveryChain(graph, P, "PAY-2").data!;
    expect(d.missing).toEqual([]);
    expect(d.builds.some((b) => b.conclusion === "success")).toBe(true);
  });
  it("Q7 missing information lists unsynced referenced tickets", () => {
    const d = Q.missingDeliveryInformation(graph, P).data;
    expect(d.unsyncedReferencedTickets).toEqual(["PAY-99"]);
    expect(d.issues.map((i) => i.key)).toContain("PAY-18");
  });
  it("Q8 release risks are sorted by severity", () => {
    const risks = Q.releaseRisks(graph, P).data;
    expect(risks[0]!.severity).toBe("high");
    expect(risks.map((r) => r.kind)).toEqual(
      expect.arrayContaining([
        "done_not_deployed",
        "merged_with_failed_gate",
        "blocked_issue",
        "failed_deployment",
        "partially_deployed",
      ]),
    );
  });
  it("overview counts organisations and commits per organisation", () => {
    const d = Q.projectOverview(graph, P).data;
    expect(d.organizations).toHaveLength(4);
    expect(Object.keys(d.commitsByOrganization)).toEqual(
      expect.arrayContaining(["nexalis", "freelance-camille", "freelance-yanis"]),
    );
  });
});

describe("a workflow success is not a deployment", () => {
  it("a commit with a green CI but no deployment is not delivered", () => {
    const snap: SyncSnapshotInput = {
      project: { id: "demo-p", name: "P", jiraProjectKeys: ["ABC"] },
      observedAt: AT,
      issues: [
        {
          key: "ABC-1",
          summary: "s",
          type: "Story",
          status: "Done",
          statusCategory: "done",
          updated: AT,
        },
      ],
      commits: [{ sha: "a".repeat(40), message: "feat: x (ABC-1)", author: "dev", date: AT }],
      workflowRuns: [
        {
          id: 1,
          name: "CI",
          status: "completed",
          conclusion: "success",
          headSha: "a".repeat(40),
          headBranch: "main",
          event: "push",
          createdAt: AT,
        },
      ],
    };
    const g = buildGraph(snap);
    const chain = Q.issueDeliveryChain(g, "demo-p", "ABC-1").data!;
    expect(chain.deliveredToProduction).toBe(false);
    expect(Q.deployedChanges(g, "demo-p").data.deployment).toBeNull();
    expect(Q.releaseRisks(g, "demo-p").data[0]!.kind).toBe("done_not_deployed");
  });
});

describe("deterministic router", () => {
  const keys = ["PAY"];
  it.each([
    ["Quels tickets sont liés à la PR #13 ?", "traceability_tickets_for_pull_request"],
    ["Quels changements n'ont pas de ticket ?", "traceability_changes_without_ticket"],
    ["Quelles PR n'ont pas de contrôle qualité ?", "traceability_get_pull_request_quality"],
    ["Quels tickets sont bloqués par SonarQube ?", "traceability_issues_blocked_by_quality"],
    ["Qu'est-ce qui est déployé en production ?", "traceability_deployed_changes"],
    ["Montre la chaîne de PAY-6", "traceability_get_issue_delivery_chain"],
    [
      "Quelles informations manquent pour confirmer une livraison ?",
      "traceability_missing_delivery_information",
    ],
    ["Quels sont les risques de release ?", "traceability_get_release_risks"],
    ["Résumé de l'avancement", "traceability_project_overview"],
  ])("%s -> %s", (q, tool) => {
    expect(routeQuestion(q, keys).tool).toBe(tool);
  });
  it("returns help for unknown questions", () => {
    const r = answerDeterministic(graph, P, "quelle heure est-il ?", keys);
    expect(r.tool).toBeNull();
    expect(r.text).toMatch(/Je peux répondre/);
  });
  it("produces a French summary flagged as demo", () => {
    const r = answerDeterministic(graph, P, "Quels tickets sont bloqués par SonarQube ?", keys);
    expect(r.text).toMatch(/^\[Démo\] Bloqués par SonarQube : PAY-5/);
  });
});
