import { describe, expect, it } from "vitest";
import { GitHubConnector } from "../../src/connectors/github.js";
import { ReadOnlyHttpClient, nextLink } from "../../src/connectors/http.js";
import { JiraConnector } from "../../src/connectors/jira.js";
import { SonarQubeConnector } from "../../src/connectors/sonarqube.js";
import { json, mockFetch } from "../helpers/fetch-mock.js";

const noSleep = async () => {};

describe("ReadOnlyHttpClient", () => {
  it("only issues GET requests", async () => {
    const { fetch, calls } = mockFetch({ "/x": { ok: true } });
    const http = new ReadOnlyHttpClient({ source: "t", baseUrl: "https://api.example.com", fetch });
    await http.get("x");
    expect(calls[0]!.method).toBe("GET");
    expect(Object.keys(ReadOnlyHttpClient.prototype)).not.toContain("post");
  });
  it("refuses non-https remote hosts but allows localhost", () => {
    expect(
      () => new ReadOnlyHttpClient({ source: "t", baseUrl: "http://remote.example.com" }),
    ).toThrow(/https/);
    expect(
      () => new ReadOnlyHttpClient({ source: "t", baseUrl: "http://localhost:9000" }),
    ).not.toThrow();
  });
  it("refuses path traversal and cross-origin pagination", async () => {
    const http = new ReadOnlyHttpClient({ source: "t", baseUrl: "https://api.example.com" });
    expect(() => http.url("../admin")).toThrow();
    expect(() => http.url("https://evil.example.org/x")).toThrow();
    await expect(http.getUrl("https://evil.example.org/x")).rejects.toThrow(/Cross-origin/);
  });
  it("retries 503 then succeeds", async () => {
    let n = 0;
    const { fetch } = mockFetch({ "/x": () => (n++ === 0 ? json({}, 503) : json({ v: 1 })) });
    const http = new ReadOnlyHttpClient({
      source: "t",
      baseUrl: "https://api.example.com",
      fetch,
      sleep: noSleep,
    });
    expect((await http.get<{ v: number }>("x")).data.v).toBe(1);
  });
  it("treats GitHub 403 with exhausted quota as rate limited", async () => {
    const { fetch } = mockFetch({ "/x": () => json({}, 403, { "x-ratelimit-remaining": "0" }) });
    const http = new ReadOnlyHttpClient({
      source: "github",
      baseUrl: "https://api.example.com",
      fetch,
      sleep: noSleep,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });
    await expect(http.get("x")).rejects.toMatchObject({ code: "rate_limited" });
  });
  it("parses Link headers", () => {
    expect(
      nextLink(
        '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"',
      ),
    ).toBe("https://api.github.com/x?page=2");
    expect(nextLink(null)).toBeUndefined();
  });
});

describe("GitHubConnector (mocked API)", () => {
  const pull = {
    number: 7,
    title: "PAY-7 VoP",
    state: "open",
    merged_at: null,
    user: { login: "dev" },
    head: { ref: "feature/PAY-7", sha: "a".repeat(40) },
    base: { ref: "main" },
    body: null,
    html_url: "https://github.com/o/r/pull/7",
    created_at: "2026-10-01T00:00:00Z",
  };

  it("lists pull requests with pagination and auth header", async () => {
    const { fetch, calls } = mockFetch({
      "/repos/o/r/pulls": (url: URL) =>
        url.searchParams.get("page") === "2"
          ? json([{ ...pull, number: 8 }])
          : json([pull], 200, {
              link: '<https://api.github.com/repos/o/r/pulls?page=2>; rel="next"',
            }),
    });
    const gh = new GitHubConnector({ token: "ghp_test", fetch });
    const prs = await gh.listPullRequests({ owner: "o", repo: "r" });
    expect(prs.map((p) => p.number)).toEqual([7, 8]);
    expect(prs[0]).toMatchObject({
      merged: false,
      headRef: "feature/PAY-7",
      author: "dev",
      body: "",
    });
    expect(calls[0]!.headers.authorization).toBe("Bearer ghp_test");
    expect(calls[0]!.headers["x-github-api-version"]).toBe("2022-11-28");
  });

  it("validates inputs before calling the API", async () => {
    const { fetch, calls } = mockFetch({});
    const gh = new GitHubConnector({ fetch });
    await expect(gh.getCommit({ owner: "o", repo: "r" }, "not-a-sha")).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(gh.listPullRequests({ owner: "o/../x", repo: "r" })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("maps workflow runs filtered by SHA", async () => {
    const { fetch, calls } = mockFetch({
      "/repos/o/r/actions/runs": json({
        workflow_runs: [
          {
            id: 1,
            name: "CI",
            status: "completed",
            conclusion: "success",
            head_sha: "b".repeat(40),
            head_branch: "main",
            event: "push",
            html_url: "https://github.com/o/r/actions/runs/1",
            created_at: "2026-10-01T00:00:00Z",
          },
        ],
      }),
    });
    const runs = await new GitHubConnector({ fetch }).getWorkflowRuns(
      { owner: "o", repo: "r" },
      { headSha: "b".repeat(40) },
    );
    expect(runs[0]).toMatchObject({ conclusion: "success", headSha: "b".repeat(40) });
    expect(new URL(calls[0]!.url).searchParams.get("head_sha")).toBe("b".repeat(40));
  });

  it("surfaces 404 as not_found", async () => {
    const { fetch } = mockFetch({});
    await expect(
      new GitHubConnector({ fetch }).getCommit({ owner: "o", repo: "r" }, "abcdef1"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("JiraConnector (mocked API)", () => {
  const issue = {
    key: "PAY-13",
    fields: {
      summary: "Score anti-fraude",
      status: { name: "À faire", statusCategory: { key: "new" } },
      issuetype: { name: "Story" },
      assignee: null,
      updated: "2026-10-01T00:00:00.000+0000",
      issuelinks: [
        {
          type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
          inwardIssue: { key: "PAY-14" },
        },
      ],
    },
  };

  it("uses /rest/api/3/search/jql with basic auth on Cloud", async () => {
    const { fetch, calls } = mockFetch({ "/rest/api/3/search/jql": json({ issues: [issue] }) });
    const jira = new JiraConnector({
      baseUrl: "https://acme.atlassian.net",
      email: "a@b.c",
      apiToken: "tok",
      fetch,
    });
    const issues = await jira.searchIssues("project = PAY");
    expect(issues[0]).toMatchObject({
      key: "PAY-13",
      statusCategory: "new",
      links: [{ direction: "inward", relation: "is blocked by", key: "PAY-14" }],
    });
    expect(calls[0]!.headers.authorization).toBe(
      `Basic ${Buffer.from("a@b.c:tok").toString("base64")}`,
    );
    expect(new URL(calls[0]!.url).searchParams.get("jql")).toBe("project = PAY");
  });

  it("uses REST v2 with bearer PAT on Data Center", async () => {
    const { fetch, calls } = mockFetch({ "/rest/api/2/issue/PAY-13": json(issue) });
    const jira = new JiraConnector({
      baseUrl: "https://jira.acme.example",
      edition: "datacenter",
      apiToken: "pat",
      fetch,
    });
    expect((await jira.getIssueLinks("PAY-13"))[0]!.key).toBe("PAY-14");
    expect(calls[0]!.headers.authorization).toBe("Bearer pat");
  });

  it("validates issue keys and configuration", async () => {
    expect(() => new JiraConnector({ baseUrl: "https://x.atlassian.net", apiToken: "t" })).toThrow(
      /JIRA_EMAIL/,
    );
    const jira = new JiraConnector({
      baseUrl: "https://x.atlassian.net",
      email: "e",
      apiToken: "t",
      fetch: mockFetch({}).fetch,
    });
    await expect(jira.getIssue("pay-1; DROP")).rejects.toThrow();
  });
});

describe("SonarQubeConnector (mocked API)", () => {
  it("maps quality gate conditions with real field names", async () => {
    const { fetch, calls } = mockFetch({
      "/api/qualitygates/project_status": json({
        projectStatus: {
          status: "ERROR",
          conditions: [
            {
              status: "ERROR",
              metricKey: "new_coverage",
              comparator: "LT",
              errorThreshold: "80",
              actualValue: "54.2",
            },
          ],
        },
      }),
    });
    const sonar = new SonarQubeConnector({
      baseUrl: "http://localhost:9000",
      token: "squ_x",
      fetch,
    });
    const gate = await sonar.getQualityGate("aurore-pay");
    expect(gate).toEqual({
      projectKey: "aurore-pay",
      status: "ERROR",
      conditions: [
        {
          metric: "new_coverage",
          status: "ERROR",
          actual: "54.2",
          threshold: "80",
          comparator: "LT",
        },
      ],
    });
    expect(calls[0]!.headers.authorization).toBe("Bearer squ_x");
  });

  it("maps measures and issues", async () => {
    const { fetch } = mockFetch({
      "/api/measures/component": json({
        component: {
          measures: [
            { metric: "bugs", value: "2" },
            { metric: "coverage", value: "80.1" },
          ],
        },
      }),
      "/api/issues/search": json({
        paging: { total: 1 },
        issues: [
          {
            key: "i1",
            rule: "js:S1",
            impacts: [{ severity: "HIGH" }],
            message: "m",
            component: "c",
            issueStatus: "OPEN",
          },
        ],
      }),
    });
    const sonar = new SonarQubeConnector({ baseUrl: "http://localhost:9000", fetch });
    expect(await sonar.getProjectMeasures("p")).toEqual({ bugs: "2", coverage: "80.1" });
    expect((await sonar.getIssues("p")).issues[0]).toMatchObject({
      severity: "HIGH",
      status: "OPEN",
    });
  });
});
