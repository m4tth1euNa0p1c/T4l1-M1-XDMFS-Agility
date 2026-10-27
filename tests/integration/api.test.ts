import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { ensureDemoProject } from "../../src/demo/seed.js";
import { SqliteTraceStore } from "../../src/memory/sqlite-store.js";
import type {
  GenerationRequest,
  GenerationResult,
  LLMProvider,
} from "../../src/providers/types.js";
import { ROOT } from "../helpers/academic.js";

/** Scripted provider: first asks for a tool, then answers. */
class ScriptedProvider implements LLMProvider {
  readonly id = "mock" as const;
  requests: GenerationRequest[] = [];
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    this.requests.push(req);
    const base = {
      provider: "mock" as const,
      model: "scripted",
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 0,
    };
    if (this.requests.length % 2 === 1) {
      return {
        ...base,
        text: "",
        stopReason: "tool_use",
        toolCalls: [{ id: "t1", name: "traceability_get_release_risks", input: {} }],
      };
    }
    return {
      ...base,
      text: "Risque principal : PAY-18.\nSources : PAY-18\nLimites : données fictives",
      stopReason: "end",
      toolCalls: [],
    };
  }
  capabilities() {
    return {
      provider: "mock" as const,
      streaming: false,
      toolCalling: true,
      maxOutputTokens: 1000,
      verifiedAgainstRealService: false,
      notes: [],
    };
  }
}

const store = new SqliteTraceStore(":memory:");
let server: Server;
let base: string;
const provider = new ScriptedProvider();

beforeAll(async () => {
  store.migrate();
  ensureDemoProject(store);
  const handler = createApp({
    store,
    provider,
    publicDir: path.join(ROOT, "public"),
    log: () => {},
    askRateLimit: { capacity: 8, refillPerMinute: 0.0001 },
  });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  store.close();
});

const ask = (
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  fetch(`${base}/api/projects/aurore-pay/ask`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("HTTP API", () => {
  it("serves the academic chatbot with security headers", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="historique"');
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("blocks path traversal and hides package.json", async () => {
    expect((await fetch(`${base}/..%2f..%2fpackage.json`)).status).toBeGreaterThanOrEqual(403);
    expect((await fetch(`${base}/js/package.json`)).status).toBe(404);
  });

  it("reports health and status without leaking secrets", async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ status: "ok" });
    const status = await (await fetch(`${base}/api/status`)).text();
    expect(status).not.toMatch(/sk-ant-|ghp_|squ_/);
    expect(JSON.parse(status).connectors.map((c: { name: string }) => c.name)).toEqual([
      "github",
      "jira",
      "sonarqube",
    ]);
  });

  it("lists projects and runs a tool by name", async () => {
    expect((await (await fetch(`${base}/api/projects`)).json())[0]).toMatchObject({
      id: "aurore-pay",
      demo: true,
    });
    const chain = await (
      await fetch(
        `${base}/api/projects/aurore-pay/tools/traceability_get_issue_delivery_chain?issue_key=PAY-6`,
      )
    ).json();
    expect(chain.data.partiallyDelivered).toBe(true);
    const pr = await (
      await fetch(
        `${base}/api/projects/aurore-pay/tools/traceability_tickets_for_pull_request?pr_number=13`,
      )
    ).json();
    expect(pr.data.issues[0].key).toBe("PAY-7");
  });

  it("answers deterministically on demand", async () => {
    const res = await ask({
      question: "Quels tickets sont bloqués par SonarQube ?",
      mode: "deterministic",
    });
    const body = await res.json();
    expect(body).toMatchObject({
      mode: "deterministic",
      tool: "traceability_issues_blocked_by_quality",
    });
  });

  it("runs the LLM agent loop with tool calls (scripted provider)", async () => {
    const body = await (await ask({ question: "Quels risques ?", mode: "llm" })).json();
    expect(body.mode).toBe("llm");
    expect(body.toolCalls).toEqual([
      { name: "traceability_get_release_risks", input: {}, ok: true },
    ]);
    expect(body.text).toContain("PAY-18");
    const second = provider.requests[provider.requests.length - 1]!;
    expect(JSON.stringify(second.messages)).toContain("tool_result");
  });

  it("validates input", async () => {
    expect((await ask({ question: "" })).status).toBe(400);
    expect((await ask("{oops")).status).toBe(400);
    expect((await ask({ question: "x" }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await ask({ question: "x".repeat(20_000) })).status).toBe(413);
  });

  it("returns 404 for unknown projects and endpoints", async () => {
    expect((await fetch(`${base}/api/projects/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/nothing`)).status).toBe(404);
  });

  it("rate limits the ask endpoint", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await ask({ question: "risques", mode: "deterministic" })).status);
    expect(statuses).toContain(429);
  });
});
