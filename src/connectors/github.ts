import { z } from "zod";
import { XdmfsError } from "../core/errors.js";
import { ReadOnlyHttpClient, nextLink, type FetchLike } from "./http.js";

/**
 * GitHub REST connector (read-only). Endpoints used:
 *  - GET /repos/{owner}/{repo}/pulls
 *  - GET /repos/{owner}/{repo}/pulls/{number}/commits
 *  - GET /repos/{owner}/{repo}/commits/{ref}
 *  - GET /repos/{owner}/{repo}/actions/runs
 *  - GET /repos/{owner}/{repo}/deployments
 * A fine-grained token with read access to contents, pull requests,
 * actions and deployments is sufficient. Public repos work without token,
 * at a lower rate limit.
 */

export const RepoRefSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9-]{1,39}$/),
  repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
});
export type RepoRef = z.infer<typeof RepoRefSchema>;

export interface PullRequestSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  author: string | null;
  headRef: string;
  baseRef: string;
  headSha: string;
  body: string;
  url: string;
  createdAt: string;
  mergedAt: string | null;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
  parents: string[];
}

export interface WorkflowRunSummary {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  headSha: string;
  headBranch: string | null;
  event: string;
  url: string;
  createdAt: string;
}

export interface DeploymentSummary {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  createdAt: string;
  url: string;
}

export interface GitHubConnectorOptions {
  token?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  maxPages?: number;
}

export class GitHubConnector {
  private readonly http: ReadOnlyHttpClient;
  private readonly maxPages: number;
  readonly authenticated: boolean;

  constructor(options: GitHubConnectorOptions = {}) {
    this.authenticated = Boolean(options.token);
    this.maxPages = options.maxPages ?? 5;
    this.http = new ReadOnlyHttpClient({
      source: "github",
      baseUrl: options.baseUrl ?? "https://api.github.com",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  private async paginate<T>(path: string, query: Record<string, string | number>): Promise<T[]> {
    const out: T[] = [];
    let page = await this.http.get<T[]>(path, { per_page: 100, ...query });
    out.push(...page.data);
    for (let i = 1; i < this.maxPages; i++) {
      const next = nextLink(page.headers.get("link"));
      if (!next) break;
      page = await this.http.getUrl<T[]>(next);
      out.push(...page.data);
    }
    return out;
  }

  async listPullRequests(
    ref: RepoRef,
    state: "open" | "closed" | "all" = "all",
  ): Promise<PullRequestSummary[]> {
    const { owner, repo } = RepoRefSchema.parse(ref);
    const raw = await this.paginate<RawPull>(`repos/${owner}/${repo}/pulls`, { state });
    return raw.map(mapPull);
  }

  async listPullRequestCommits(ref: RepoRef, number: number): Promise<CommitSummary[]> {
    const { owner, repo } = RepoRefSchema.parse(ref);
    if (!Number.isInteger(number) || number <= 0) {
      throw new XdmfsError("invalid_request", "github", "Invalid pull request number.");
    }
    const raw = await this.paginate<RawCommit>(
      `repos/${owner}/${repo}/pulls/${number}/commits`,
      {},
    );
    return raw.map(mapCommit);
  }

  async getCommit(ref: RepoRef, sha: string): Promise<CommitSummary> {
    const { owner, repo } = RepoRefSchema.parse(ref);
    if (!/^[0-9a-f]{7,40}$/i.test(sha))
      throw new XdmfsError("invalid_request", "github", "Invalid commit SHA.");
    const { data } = await this.http.get<RawCommit>(`repos/${owner}/${repo}/commits/${sha}`);
    return mapCommit(data);
  }

  async getWorkflowRuns(
    ref: RepoRef,
    options: { headSha?: string; branch?: string } = {},
  ): Promise<WorkflowRunSummary[]> {
    const { owner, repo } = RepoRefSchema.parse(ref);
    const query: Record<string, string | number> = { per_page: 100 };
    if (options.headSha) query.head_sha = options.headSha;
    if (options.branch) query.branch = options.branch;
    const { data } = await this.http.get<{ workflow_runs: RawRun[] }>(
      `repos/${owner}/${repo}/actions/runs`,
      query,
    );
    return data.workflow_runs.map((r) => ({
      id: r.id,
      name: r.name ?? "",
      status: r.status ?? "unknown",
      conclusion: r.conclusion ?? null,
      headSha: r.head_sha,
      headBranch: r.head_branch ?? null,
      event: r.event,
      url: r.html_url,
      createdAt: r.created_at,
    }));
  }

  async listDeployments(ref: RepoRef): Promise<DeploymentSummary[]> {
    const { owner, repo } = RepoRefSchema.parse(ref);
    const raw = await this.paginate<RawDeployment>(`repos/${owner}/${repo}/deployments`, {});
    return raw.map((d) => ({
      id: d.id,
      sha: d.sha,
      ref: d.ref,
      environment: d.environment,
      createdAt: d.created_at,
      url: d.url,
    }));
  }
}

interface RawPull {
  number: number;
  title: string;
  state: "open" | "closed";
  merged_at: string | null;
  user: { login: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  body: string | null;
  html_url: string;
  created_at: string;
}
interface RawCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null };
  author: { login: string } | null;
  parents?: Array<{ sha: string }>;
}
interface RawRun {
  id: number;
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  head_sha: string;
  head_branch?: string | null;
  event: string;
  html_url: string;
  created_at: string;
}
interface RawDeployment {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  created_at: string;
  url: string;
}

function mapPull(p: RawPull): PullRequestSummary {
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    merged: p.merged_at !== null,
    author: p.user?.login ?? null,
    headRef: p.head.ref,
    baseRef: p.base.ref,
    headSha: p.head.sha,
    body: p.body ?? "",
    url: p.html_url,
    createdAt: p.created_at,
    mergedAt: p.merged_at,
  };
}

function mapCommit(c: RawCommit): CommitSummary {
  return {
    sha: c.sha,
    message: c.commit.message,
    author: c.author?.login ?? c.commit.author?.name ?? null,
    date: c.commit.author?.date ?? null,
    url: c.html_url,
    parents: (c.parents ?? []).map((p) => p.sha),
  };
}
