import { z } from "zod";

/**
 * Normalized sync snapshot: what connectors produce and what the graph
 * builder consumes. Demo fixtures use the same format, so the demo path
 * and the live path share all correlation logic.
 */

const isoDate = z.string().datetime({ offset: true });

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["client", "integrator", "freelance", "vendor"]),
});

export const MemberSchema = z.object({
  login: z.string(),
  name: z.string(),
  organization: z.string(),
  role: z.string(),
});

export const ProjectInfoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,64}$/),
  name: z.string(),
  description: z.string().default(""),
  jiraProjectKeys: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,9}$/)).min(1),
  repository: z.object({ owner: z.string(), repo: z.string() }).optional(),
  sonarProjectKey: z.string().optional(),
  organizations: z.array(OrganizationSchema).default([]),
  members: z.array(MemberSchema).default([]),
  /** True when the data is fictional demo data. Shown in every answer. */
  demo: z.boolean().default(false),
});

export const SnapshotIssueSchema = z.object({
  key: z.string(),
  summary: z.string(),
  type: z.string(),
  status: z.string(),
  statusCategory: z.enum(["new", "indeterminate", "done", "undefined"]).default("undefined"),
  assignee: z.string().nullable().default(null),
  sprint: z.string().optional(),
  storyPoints: z.number().optional(),
  priority: z.string().optional(),
  created: isoDate.optional(),
  updated: isoDate,
  url: z.string().url().optional(),
  links: z
    .array(
      z.object({
        type: z.string(),
        direction: z.enum(["inward", "outward"]),
        relation: z.string(),
        key: z.string(),
      }),
    )
    .default([]),
});

export const SnapshotCommitSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{7,40}$/),
  message: z.string(),
  author: z.string().nullable(),
  date: isoDate.nullable(),
  url: z.string().url().optional(),
  parents: z.array(z.string()).default([]),
});

export const SnapshotPullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean(),
  author: z.string().nullable(),
  headRef: z.string(),
  baseRef: z.string(),
  headSha: z.string(),
  body: z.string().default(""),
  url: z.string().url().optional(),
  createdAt: isoDate,
  mergedAt: isoDate.nullable().default(null),
  mergeCommitSha: z.string().nullable().default(null),
  /** SHAs listed by GET /pulls/{n}/commits: explicit, verifiable membership. */
  commits: z.array(z.string()).default([]),
  reviewers: z.array(z.string()).default([]),
});

export const SnapshotWorkflowRunSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  headSha: z.string(),
  headBranch: z.string().nullable(),
  event: z.string(),
  url: z.string().url().optional(),
  createdAt: isoDate,
});

export const SnapshotQualityGateSchema = z.object({
  analysisId: z.string(),
  /** Commit SHA the analysis was run on (SonarQube "revision"). */
  revision: z.string().nullable(),
  branch: z.string().default("main"),
  status: z.enum(["OK", "ERROR", "WARN", "NONE"]),
  date: isoDate,
  url: z.string().url().optional(),
  conditions: z
    .array(
      z.object({
        metric: z.string(),
        status: z.string(),
        actual: z.string().optional(),
        threshold: z.string().optional(),
      }),
    )
    .default([]),
  measures: z.record(z.string(), z.string()).default({}),
});

export const SnapshotDeploymentSchema = z.object({
  id: z.number().int(),
  sha: z.string(),
  environment: z.string(),
  status: z.enum(["success", "failure", "in_progress", "inactive", "unknown"]),
  createdAt: isoDate,
  url: z.string().url().optional(),
  actor: z.string().optional(),
});

export const SnapshotReleaseSchema = z.object({
  tag: z.string(),
  sha: z.string(),
  date: isoDate,
  url: z.string().url().optional(),
});

export const SyncSnapshotSchema = z.object({
  project: ProjectInfoSchema,
  observedAt: isoDate,
  issues: z.array(SnapshotIssueSchema).default([]),
  commits: z.array(SnapshotCommitSchema).default([]),
  pullRequests: z.array(SnapshotPullRequestSchema).default([]),
  workflowRuns: z.array(SnapshotWorkflowRunSchema).default([]),
  qualityGates: z.array(SnapshotQualityGateSchema).default([]),
  deployments: z.array(SnapshotDeploymentSchema).default([]),
  releases: z.array(SnapshotReleaseSchema).default([]),
});

export type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>;
export type SyncSnapshotInput = z.input<typeof SyncSnapshotSchema>;
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
