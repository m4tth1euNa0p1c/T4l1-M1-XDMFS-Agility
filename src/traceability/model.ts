import { z } from "zod";

/**
 * Typed traceability graph.
 *
 * Chain: Issue -> Branch -> Commit -> PullRequest -> Build -> QualityGate -> Deployment.
 *
 * Every relation keeps its provenance. Status semantics:
 *  - verified: confirmed by an explicit reference returned by a reliable API
 *              (e.g. GitHub lists the commit in the PR, the CI run head SHA
 *              equals the commit SHA, the deployment record names the SHA);
 *  - inferred: deduced from a convention (issue key in a branch name, commit
 *              message or PR title). Never promoted to verified;
 *  - unknown:  not enough evidence. Used to make gaps explicit.
 */

export const ENTITY_TYPES = [
  "Project",
  "Issue",
  "Branch",
  "Commit",
  "PullRequest",
  "Build",
  "QualityGate",
  "Deployment",
  "Release",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATION_TYPES = [
  /** Commit/PR/Branch implements an Issue. */
  "IMPLEMENTS",
  /** Text of an artifact mentions another artifact. */
  "REFERENCES",
  /** PR contains Commit, Release contains Commit/Issue, Project contains Issue. */
  "CONTAINS",
  /** Build or QualityGate validates a Commit. */
  "VALIDATES",
  /** Issue blocks Issue, or failed QualityGate blocks a PR. */
  "BLOCKS",
  /** Commit deployed in a Deployment. */
  "DEPLOYED_IN",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const RELATION_STATUSES = ["verified", "inferred", "unknown"] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

export const CORRELATION_METHODS = [
  "api_explicit_link",
  "jira_issue_link",
  "ci_head_sha",
  "sonar_analysis_revision",
  "deployment_sha",
  "git_ancestry",
  "commit_message_key",
  "branch_name_key",
  "pr_title_key",
  "pr_body_key",
  "manual",
] as const;
export type CorrelationMethod = (typeof CORRELATION_METHODS)[number];

/** Methods able to produce a verified relation. Conventions cannot. */
export const VERIFYING_METHODS: ReadonlySet<CorrelationMethod> = new Set([
  "api_explicit_link",
  "jira_issue_link",
  "ci_head_sha",
  "sonar_analysis_revision",
  "deployment_sha",
  "git_ancestry",
]);

export const DataSourceSchema = z.enum(["github", "jira", "sonarqube", "demo", "manual"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const EntitySchema = z.object({
  /** Stable id: `${type}:${projectId}:${key}`. */
  id: z.string().min(3),
  type: z.enum(ENTITY_TYPES),
  projectId: z.string().min(1),
  /** Natural key in the source system: issue key, SHA, PR number... */
  key: z.string().min(1),
  title: z.string(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  source: DataSourceSchema,
  url: z.string().url().optional(),
  observedAt: z.string().datetime({ offset: true }),
});
export type Entity = z.infer<typeof EntitySchema>;
export type EntityInput = z.input<typeof EntitySchema>;

export const RelationSchema = z
  .object({
    type: z.enum(RELATION_TYPES),
    from: z.string(),
    to: z.string(),
    status: z.enum(RELATION_STATUSES),
    method: z.enum(CORRELATION_METHODS),
    /** 0..1. Verified relations are 1; inferred ones are strictly below 1. */
    confidence: z.number().min(0).max(1),
    source: DataSourceSchema,
    /** Identifier of the object in the source that carries the evidence. */
    sourceObjectId: z.string().min(1),
    observedAt: z.string().datetime({ offset: true }),
    /** URL or reference a human can check. Required for verified relations. */
    evidence: z.string().min(1).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.status === "verified") {
      if (!VERIFYING_METHODS.has(r.method)) {
        ctx.addIssue({ code: "custom", message: `Method ${r.method} cannot verify a relation.` });
      }
      if (!r.evidence)
        ctx.addIssue({ code: "custom", message: "A verified relation needs evidence." });
      if (r.confidence !== 1)
        ctx.addIssue({ code: "custom", message: "A verified relation has confidence 1." });
    }
    if (r.status === "inferred" && r.confidence >= 1) {
      ctx.addIssue({ code: "custom", message: "An inferred relation must have confidence < 1." });
    }
  });
export type Relation = z.infer<typeof RelationSchema>;

export function entityId(type: EntityType, projectId: string, key: string): string {
  return `${type}:${projectId}:${key}`;
}

export function relationId(r: Pick<Relation, "type" | "from" | "to" | "method">): string {
  return `${r.type}|${r.from}|${r.to}|${r.method}`;
}

const STATUS_RANK: Record<RelationStatus, number> = { verified: 2, inferred: 1, unknown: 0 };

/** Best status across several relations between the same pair. */
export function strongest(statuses: RelationStatus[]): RelationStatus {
  return statuses.reduce<RelationStatus>(
    (best, s) => (STATUS_RANK[s] > STATUS_RANK[best] ? s : best),
    "unknown",
  );
}

/**
 * Default confidence for inference methods. Kept explicit so answers can
 * explain why a link is weaker.
 */
export const INFERENCE_CONFIDENCE: Partial<Record<CorrelationMethod, number>> = {
  commit_message_key: 0.8,
  pr_title_key: 0.75,
  pr_body_key: 0.7,
  branch_name_key: 0.6,
};
