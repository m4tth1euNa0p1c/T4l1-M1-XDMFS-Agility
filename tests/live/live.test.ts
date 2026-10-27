import { describe, expect, it } from "vitest";
import { answerWithAgent } from "../../src/assistant/agent.js";
import { GitHubConnector } from "../../src/connectors/github.js";
import { SonarQubeConnector } from "../../src/connectors/sonarqube.js";
import { envString, loadDotEnv } from "../../src/core/config.js";
import { buildBankDemoSnapshot } from "../../src/demo/bank-project.js";
import { AnthropicProvider } from "../../src/providers/anthropic.js";
import { buildGraph } from "../../src/traceability/builder.js";
import { ROOT } from "../helpers/academic.js";

/**
 * Live tests: real network calls with real credentials from .env.
 * Run with `npm run test:live`. Never run in CI. Each block is skipped
 * when its configuration is missing. Outputs are summarized; no secret
 * is ever printed.
 */
loadDotEnv(ROOT);

const anthropicKey = envString("ANTHROPIC_API_KEY");
describe.skipIf(!anthropicKey)("live: Anthropic API", () => {
  const provider = new AnthropicProvider({
    apiKey: anthropicKey!,
    model: envString("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
  });

  it("generates a short answer (refusal fallback header accepted)", async () => {
    const r = await provider.generate({
      messages: [{ role: "user", content: "Réponds uniquement par le mot : prêt" }],
      maxTokens: 512,
      effort: "low",
    });
    console.info(
      `[live anthropic] model=${r.model} stop=${r.stopReason} in=${r.usage.inputTokens} out=${r.usage.outputTokens} latency=${r.latencyMs}ms text=${JSON.stringify(r.text.slice(0, 40))}`,
    );
    expect(r.provider).toBe("anthropic");
    expect(r.stopReason).toBe("end");
    expect(r.text.toLowerCase()).toContain("prêt");
  });

  it("streams text chunks then a final result", async () => {
    let chunks = 0;
    let done = false;
    for await (const c of provider.stream({
      messages: [{ role: "user", content: "Compte de 1 à 5, séparés par des virgules." }],
      maxTokens: 512,
      effort: "low",
    })) {
      if (c.type === "text") chunks += 1;
      if (c.type === "done") done = true;
    }
    console.info(`[live anthropic stream] chunks=${chunks}`);
    expect(chunks).toBeGreaterThan(0);
    expect(done).toBe(true);
  });

  it("answers a traceability question through tool calls on the demo graph", async () => {
    const graph = buildGraph(buildBankDemoSnapshot());
    const a = await answerWithAgent(
      provider,
      graph,
      "aurore-pay",
      "Quels tickets sont bloqués par SonarQube ?",
      { maxTokens: 2048 },
    );
    console.info(
      `[live agent] tools=${a.toolCalls.map((t) => t.name).join(",")} stop=${a.stopReason} usage=${JSON.stringify(a.usage)}`,
    );
    console.info(`[live agent] answer:\n${a.text}`);
    expect(a.toolCalls.length).toBeGreaterThan(0);
    expect(a.toolCalls.every((t) => t.ok)).toBe(true);
    expect(a.text).toMatch(/PAY-7/);
    expect(a.text).toMatch(/PAY-5/);
  });
});

const ghRepo = { owner: "m4tth1euNa0p1c", repo: "T4l1-M1-XDMFS-Agility" };
describe.skipIf(!envString("GITHUB_TOKEN"))("live: GitHub REST API", () => {
  const gh = new GitHubConnector({ token: envString("GITHUB_TOKEN")! });

  it("reads pull requests and workflow runs of the project repository", async () => {
    const prs = await gh.listPullRequests(ghRepo, "all");
    const runs = await gh.getWorkflowRuns(ghRepo);
    console.info(`[live github] pulls=${prs.length} runs=${runs.length}`);
    expect(Array.isArray(prs)).toBe(true);
    expect(Array.isArray(runs)).toBe(true);
  });

  it("reads the first commit of main", async () => {
    const prs = await gh.listPullRequests(ghRepo, "all");
    const sha = prs[0]?.headSha;
    if (!sha) return;
    const commit = await gh.getCommit(ghRepo, sha);
    expect(commit.sha).toBe(sha);
  });
});

describe.skipIf(!envString("SONARQUBE_URL"))("live: SonarQube Web API", () => {
  const sonar = new SonarQubeConnector({
    baseUrl: envString("SONARQUBE_URL")!,
    ...(envString("SONARQUBE_TOKEN") ? { token: envString("SONARQUBE_TOKEN")! } : {}),
  });

  it("reports server status", async () => {
    const s = await sonar.getSystemStatus();
    console.info(`[live sonarqube] status=${s.status} version=${s.version}`);
    expect(s.status).toBe("UP");
  });

  it("reads measures, issues and quality gate of the analysed project", async () => {
    const measures = await sonar.getProjectMeasures("xdmfs-agility");
    const issues = await sonar.getIssues("xdmfs-agility", { pageSize: 5 });
    const gate = await sonar.getQualityGate("xdmfs-agility");
    console.info(
      `[live sonarqube] gate=${gate.status} coverage=${measures.coverage} bugs=${measures.bugs} vulnerabilities=${measures.vulnerabilities} code_smells=${measures.code_smells} issues=${issues.total}`,
    );
    expect(["OK", "ERROR", "WARN", "NONE"]).toContain(gate.status);
    expect(measures.ncloc).toBeDefined();
  });
});
