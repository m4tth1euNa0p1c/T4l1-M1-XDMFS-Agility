import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitHubConnector } from "../../src/connectors/github.js";
import { ensureDemoProject } from "../../src/demo/seed.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { SqliteTraceStore } from "../../src/memory/sqlite-store.js";
import { json, mockFetch } from "../helpers/fetch-mock.js";

const store = new SqliteTraceStore(":memory:");
const client = new Client({ name: "contract-test", version: "1.0.0" });
const { fetch } = mockFetch({ "/repos/o/r/actions/runs": json({ workflow_runs: [] }) });

beforeAll(async () => {
  store.migrate();
  ensureDemoProject(store);
  const { server } = createMcpServer({
    store,
    connectors: { github: new GitHubConnector({ fetch }) },
    defaultProjectId: "aurore-pay",
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
});
afterAll(async () => {
  await client.close();
  store.close();
});

function parse(result: Awaited<ReturnType<typeof client.callTool>>): unknown {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("MCP server contract", () => {
  it("exposes the expected read-only tools and no unconfigured connector", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "traceability_list_projects",
        "traceability_get_issue_delivery_chain",
        "traceability_get_pull_request_quality",
        "traceability_get_release_risks",
        "github_list_pull_requests",
        "github_get_commit",
        "github_get_workflow_runs",
      ]),
    );
    expect(names.some((n) => n.startsWith("jira_"))).toBe(false);
    expect(names.some((n) => n.startsWith("sonarqube_"))).toBe(false);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("answers a delivery chain question with sources and limitations", async () => {
    const data = parse(
      await client.callTool({
        name: "traceability_get_issue_delivery_chain",
        arguments: { issue_key: "PAY-7" },
      }),
    ) as {
      demo: boolean;
      data: { issue: { key: string }; missing: string[] };
      sources: unknown[];
      limitations: string[];
    };
    expect(data.demo).toBe(true);
    expect(data.data.issue.key).toBe("PAY-7");
    expect(data.data.missing.join(" ")).toMatch(/quality gate/i);
    expect(data.sources.length).toBeGreaterThan(0);
    expect(data.limitations.length).toBeGreaterThan(0);
  });

  it("returns isError with a normalized code on invalid input", async () => {
    const result = await client.callTool({
      name: "traceability_get_issue_delivery_chain",
      arguments: { issue_key: "pas-une-cle" },
    });
    expect(result.isError).toBe(true);
  });

  it("returns isError for an unknown project", async () => {
    const result = await client.callTool({
      name: "traceability_get_release_risks",
      arguments: { project_id: "inconnu" },
    });
    expect(result.isError).toBe(true);
    expect((parse(result) as { code: string }).code).toBe("not_found");
  });

  it("proxies GitHub through the read-only connector", async () => {
    const result = await client.callTool({
      name: "github_get_workflow_runs",
      arguments: { owner: "o", repo: "r" },
    });
    expect(result.isError).toBeFalsy();
    expect(parse(result)).toEqual([]);
  });
});
