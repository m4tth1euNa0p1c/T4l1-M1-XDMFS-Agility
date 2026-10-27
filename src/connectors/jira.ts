import { z } from "zod";
import { XdmfsError } from "../core/errors.js";
import { ReadOnlyHttpClient, type FetchLike } from "./http.js";

/**
 * Jira connector (read-only).
 *
 * Jira Cloud (REST v3):
 *  - GET /rest/api/3/search/jql   (the legacy /rest/api/3/search was removed in 2025)
 *  - GET /rest/api/3/issue/{key}?fields=...
 *  Auth: basic auth with account email + API token.
 * Jira Data Center (REST v2): GET /rest/api/2/search, /rest/api/2/issue/{key};
 *  Auth: personal access token (Bearer).
 *
 * Sprint data comes from the Jira Software agile API and needs the
 * Software product; it is not used here.
 *
 * Status: tested with mocks and fixtures only. No Jira instance available.
 */

export const IssueKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,9}-\d{1,7}$/);

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  type: string;
  assignee: string | null;
  updated: string;
  links: JiraIssueLink[];
}

export interface JiraIssueLink {
  type: string;
  direction: "inward" | "outward";
  /** Human-readable relation, e.g. "is blocked by". */
  relation: string;
  key: string;
}

export interface JiraConnectorOptions {
  baseUrl: string;
  edition?: "cloud" | "datacenter";
  email?: string;
  apiToken?: string;
  fetch?: FetchLike;
}

const FIELDS = "summary,status,issuetype,assignee,updated,issuelinks";

export class JiraConnector {
  private readonly http: ReadOnlyHttpClient;
  private readonly apiPrefix: string;
  readonly edition: "cloud" | "datacenter";

  constructor(options: JiraConnectorOptions) {
    if (!options.baseUrl || !options.apiToken) {
      throw new XdmfsError(
        "not_configured",
        "jira",
        "JIRA_BASE_URL and JIRA_API_TOKEN are required.",
      );
    }
    this.edition = options.edition ?? "cloud";
    let authorization: string;
    if (this.edition === "cloud") {
      if (!options.email)
        throw new XdmfsError("not_configured", "jira", "JIRA_EMAIL is required for Jira Cloud.");
      authorization = `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString("base64")}`;
    } else {
      authorization = `Bearer ${options.apiToken}`;
    }
    this.apiPrefix = this.edition === "cloud" ? "rest/api/3" : "rest/api/2";
    this.http = new ReadOnlyHttpClient({
      source: "jira",
      baseUrl: options.baseUrl,
      headers: { authorization },
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async searchIssues(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    if (!jql.trim() || jql.length > 2000)
      throw new XdmfsError("invalid_request", "jira", "Invalid JQL.");
    const path =
      this.edition === "cloud" ? `${this.apiPrefix}/search/jql` : `${this.apiPrefix}/search`;
    const { data } = await this.http.get<{ issues: RawIssue[] }>(path, {
      jql,
      maxResults: Math.min(Math.max(1, maxResults), 100),
      fields: FIELDS,
    });
    return data.issues.map(mapIssue);
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const parsed = IssueKeySchema.parse(key);
    const { data } = await this.http.get<RawIssue>(`${this.apiPrefix}/issue/${parsed}`, {
      fields: FIELDS,
    });
    return mapIssue(data);
  }

  async getIssueLinks(key: string): Promise<JiraIssueLink[]> {
    return (await this.getIssue(key)).links;
  }
}

interface RawIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    issuetype?: { name?: string };
    assignee?: { displayName?: string } | null;
    updated?: string;
    issuelinks?: Array<{
      type: { name: string; inward: string; outward: string };
      inwardIssue?: { key: string };
      outwardIssue?: { key: string };
    }>;
  };
}

function mapIssue(raw: RawIssue): JiraIssue {
  const f = raw.fields ?? {};
  return {
    key: raw.key,
    summary: f.summary ?? "",
    status: f.status?.name ?? "Unknown",
    statusCategory: f.status?.statusCategory?.key ?? "undefined",
    type: f.issuetype?.name ?? "Unknown",
    assignee: f.assignee?.displayName ?? null,
    updated: f.updated ?? "",
    links: (f.issuelinks ?? []).flatMap((l): JiraIssueLink[] => {
      if (l.inwardIssue) {
        return [
          {
            type: l.type.name,
            direction: "inward",
            relation: l.type.inward,
            key: l.inwardIssue.key,
          },
        ];
      }
      if (l.outwardIssue) {
        return [
          {
            type: l.type.name,
            direction: "outward",
            relation: l.type.outward,
            key: l.outwardIssue.key,
          },
        ];
      }
      return [];
    }),
  };
}
