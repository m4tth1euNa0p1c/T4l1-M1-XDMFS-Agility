import { z } from "zod";
import { XdmfsError } from "../core/errors.js";
import { ReadOnlyHttpClient, type FetchLike } from "./http.js";

/**
 * SonarQube Web API connector (read-only). Endpoints used, all available
 * in the Community Build:
 *  - GET /api/system/status
 *  - GET /api/measures/component
 *  - GET /api/issues/search
 *  - GET /api/qualitygates/project_status
 * Branch and pull-request analysis parameters need a commercial edition
 * (Developer+); in Community Build only the main branch is analysed.
 * Auth: user token sent as Bearer.
 */

export const ProjectKeySchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,400}$/);

export const DEFAULT_METRICS = [
  "bugs",
  "vulnerabilities",
  "code_smells",
  "coverage",
  "duplicated_lines_density",
  "ncloc",
  "security_hotspots",
  "reliability_rating",
  "security_rating",
  "sqale_rating",
] as const;

export interface QualityGateStatus {
  projectKey: string;
  status: "OK" | "ERROR" | "WARN" | "NONE";
  conditions: Array<{
    metric: string;
    status: string;
    actual?: string;
    threshold?: string;
    comparator?: string;
  }>;
}

export interface SonarIssue {
  key: string;
  rule: string;
  severity: string;
  type: string;
  message: string;
  component: string;
  line?: number;
  status: string;
}

export interface SonarQubeConnectorOptions {
  baseUrl: string;
  token?: string;
  fetch?: FetchLike;
}

export class SonarQubeConnector {
  private readonly http: ReadOnlyHttpClient;

  constructor(options: SonarQubeConnectorOptions) {
    if (!options.baseUrl)
      throw new XdmfsError("not_configured", "sonarqube", "SONARQUBE_URL is required.");
    this.http = new ReadOnlyHttpClient({
      source: "sonarqube",
      baseUrl: options.baseUrl,
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async getSystemStatus(): Promise<{ status: string; version: string }> {
    const { data } = await this.http.get<{ status: string; version: string }>("api/system/status");
    return { status: data.status, version: data.version };
  }

  async getProjectMeasures(
    projectKey: string,
    metrics: readonly string[] = DEFAULT_METRICS,
  ): Promise<Record<string, string>> {
    const key = ProjectKeySchema.parse(projectKey);
    const { data } = await this.http.get<{
      component: { measures: Array<{ metric: string; value?: string }> };
    }>("api/measures/component", { component: key, metricKeys: metrics.join(",") });
    return Object.fromEntries(data.component.measures.map((m) => [m.metric, m.value ?? ""]));
  }

  async getIssues(
    projectKey: string,
    options: { severities?: string[]; pageSize?: number } = {},
  ): Promise<{ total: number; issues: SonarIssue[] }> {
    const key = ProjectKeySchema.parse(projectKey);
    const { data } = await this.http.get<{
      total?: number;
      paging?: { total: number };
      issues: RawIssue[];
    }>("api/issues/search", {
      componentKeys: key,
      ps: Math.min(Math.max(1, options.pageSize ?? 100), 500),
      ...(options.severities?.length ? { severities: options.severities.join(",") } : {}),
    });
    return {
      total: data.paging?.total ?? data.total ?? data.issues.length,
      issues: data.issues.map((i) => ({
        key: i.key,
        rule: i.rule,
        severity: i.severity ?? i.impacts?.[0]?.severity ?? "UNKNOWN",
        type: i.type ?? "UNKNOWN",
        message: i.message,
        component: i.component,
        ...(i.line === undefined ? {} : { line: i.line }),
        status: i.issueStatus ?? i.status ?? "UNKNOWN",
      })),
    };
  }

  async getQualityGate(projectKey: string): Promise<QualityGateStatus> {
    const key = ProjectKeySchema.parse(projectKey);
    const { data } = await this.http.get<{
      projectStatus: { status: QualityGateStatus["status"]; conditions?: RawCondition[] };
    }>("api/qualitygates/project_status", { projectKey: key });
    return {
      projectKey: key,
      status: data.projectStatus.status,
      conditions: (data.projectStatus.conditions ?? []).map((c) => ({
        metric: c.metricKey,
        status: c.status,
        ...(c.actualValue === undefined ? {} : { actual: c.actualValue }),
        ...(c.errorThreshold === undefined ? {} : { threshold: c.errorThreshold }),
        ...(c.comparator === undefined ? {} : { comparator: c.comparator }),
      })),
    };
  }
}

interface RawCondition {
  status: string;
  metricKey: string;
  comparator?: string;
  errorThreshold?: string;
  actualValue?: string;
}

interface RawIssue {
  key: string;
  rule: string;
  severity?: string;
  impacts?: Array<{ severity?: string }>;
  type?: string;
  message: string;
  component: string;
  line?: number;
  status?: string;
  issueStatus?: string;
}
