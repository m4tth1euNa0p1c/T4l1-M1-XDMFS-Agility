import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  FALLBACK_BETA,
  normalizeAnthropicError,
  type AnthropicMessagesClient,
} from "../../src/providers/anthropic.js";
import { AzureFoundryProvider } from "../../src/providers/azure-foundry.js";
import {
  BedrockProvider,
  normalizeBedrockError,
  type BedrockConverseInput,
} from "../../src/providers/bedrock.js";
import { createProviderFromEnv } from "../../src/providers/registry.js";
import { UsageMeter } from "../../src/providers/types.js";
import { json, mockFetch } from "../helpers/fetch-mock.js";

const TOOL = {
  name: "lookup",
  description: "Look up",
  inputSchema: { properties: { q: { type: "string" } }, required: ["q"] },
};

function fakeAnthropic(message: Partial<Anthropic.Message>) {
  const calls: Array<{ body: Anthropic.MessageCreateParamsNonStreaming; options?: unknown }> = [];
  const client: AnthropicMessagesClient = {
    messages: {
      create: async (body, options) => {
        calls.push({ body, options });
        return {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
          ...message,
        } as Anthropic.Message;
      },
      stream: () => {
        throw new Error("not used");
      },
    },
  };
  return { client, calls };
}

describe("AnthropicProvider (mocked client)", () => {
  it("maps request: system, tools, effort, fallback beta header", async () => {
    const { client, calls } = fakeAnthropic({
      content: [{ type: "text", text: "Bonjour", citations: null }] as Anthropic.ContentBlock[],
    });
    const p = new AnthropicProvider({ client, model: "claude-opus-5-5" });
    const r = await p.generate({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: [TOOL],
      effort: "low",
      maxTokens: 100,
    });
    const { body, options } = calls[0]!;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.system).toBe("sys");
    expect(body.max_tokens).toBe(100);
    expect(body.tools?.[0]).toMatchObject({
      name: "lookup",
      input_schema: { type: "object", required: ["q"] },
    });
    expect((body as unknown as Record<string, unknown>).output_config).toEqual({ effort: "low" });
    expect((body as unknown as Record<string, unknown>).fallbacks).toBe("default");
    expect(options).toMatchObject({ headers: { "anthropic-beta": FALLBACK_BETA } });
    expect(r).toMatchObject({
      provider: "anthropic",
      text: "Bonjour",
      stopReason: "end",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("can disable the refusal fallback", async () => {
    const { client, calls } = fakeAnthropic({});
    await new AnthropicProvider({ client, refusalFallback: false }).generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect((calls[0]!.body as unknown as Record<string, unknown>).fallbacks).toBeUndefined();
    expect(calls[0]!.options).not.toHaveProperty("headers");
  });

  it("maps tool_use blocks and tool results", async () => {
    const { client, calls } = fakeAnthropic({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "tu_1", name: "lookup", input: { q: "PAY-1" } },
      ] as Anthropic.ContentBlock[],
    });
    const p = new AnthropicProvider({ client });
    const r = await p.generate({
      messages: [
        { role: "user", content: "q" },
        {
          role: "assistant",
          content: [{ type: "tool_use", call: { id: "tu_0", name: "lookup", input: { q: "x" } } }],
        },
        {
          role: "user",
          content: [{ type: "tool_result", callId: "tu_0", content: "{}", isError: false }],
        },
      ],
    });
    expect(r.stopReason).toBe("tool_use");
    expect(r.toolCalls).toEqual([{ id: "tu_1", name: "lookup", input: { q: "PAY-1" } }]);
    expect(calls[0]!.body.messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_0", content: "{}", is_error: false }],
    });
  });

  it("maps refusal stop reason", async () => {
    const { client } = fakeAnthropic({
      stop_reason: "refusal" as Anthropic.Message["stop_reason"],
    });
    expect(
      (
        await new AnthropicProvider({ client }).generate({
          messages: [{ role: "user", content: "x" }],
        })
      ).stopReason,
    ).toBe("refusal");
  });

  it("rejects invalid requests before calling the API", async () => {
    const { client, calls } = fakeAnthropic({});
    await expect(new AnthropicProvider({ client }).generate({ messages: [] })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("requires an API key when no client is injected", () => {
    expect(() => new AnthropicProvider({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("normalizes SDK errors", () => {
    expect(normalizeAnthropicError(new Anthropic.APIConnectionTimeoutError()).code).toBe("timeout");
    expect(
      normalizeAnthropicError(new Error("boom sk-ant-api03-secretsecretsecret")).message,
    ).not.toContain("secretsecret");
  });
});

describe("BedrockProvider (mocked transport)", () => {
  it("maps Converse request and response", async () => {
    let seen: BedrockConverseInput | undefined;
    const p = new BedrockProvider({
      modelId: "anthropic.claude-opus-5-5",
      transport: {
        converse: async (input) => {
          seen = input;
          return {
            output: {
              message: {
                role: "assistant",
                content: [
                  { text: "ok" },
                  { toolUse: { toolUseId: "t1", name: "lookup", input: { q: "a" } } },
                ],
              },
            },
            stopReason: "tool_use",
            usage: { inputTokens: 3, outputTokens: 4 },
          };
        },
      },
    });
    const r = await p.generate({
      system: "s",
      messages: [{ role: "user", content: "hi" }],
      tools: [TOOL],
    });
    expect(seen?.system).toEqual([{ text: "s" }]);
    expect(seen?.toolConfig?.tools[0]?.toolSpec.inputSchema.json).toMatchObject({ type: "object" });
    expect(r).toMatchObject({
      provider: "bedrock",
      text: "ok",
      stopReason: "tool_use",
      toolCalls: [{ id: "t1", name: "lookup" }],
    });
    expect(p.capabilities().verifiedAgainstRealService).toBe(false);
  });
  it("normalizes AWS exceptions", () => {
    expect(
      normalizeBedrockError(Object.assign(new Error("x"), { name: "ThrottlingException" })).code,
    ).toBe("rate_limited");
    expect(
      normalizeBedrockError(
        Object.assign(new Error("x"), { name: "ServiceQuotaExceededException" }),
      ).code,
    ).toBe("quota_exceeded");
  });
  it("refuses to start without transport", () => {
    expect(() => new BedrockProvider({ modelId: "m" })).toThrow(/transport/);
  });
});

describe("AzureFoundryProvider (mocked fetch)", () => {
  const base = {
    endpoint: "https://res.services.ai.azure.com",
    apiKey: "k-123456789",
    deployment: "my-model",
  };
  it("maps chat-completions request and response", async () => {
    const { fetch, calls } = mockFetch({
      "/models/chat/completions": json({
        model: "my-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "lookup", arguments: '{"q":"x"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 7, completion_tokens: 2 },
      }),
    });
    const p = new AzureFoundryProvider({ ...base, fetch });
    const r = await p.generate({
      system: "s",
      messages: [{ role: "user", content: "hi" }],
      tools: [TOOL],
    });
    const body = JSON.parse(calls[0]!.body!);
    expect(calls[0]!.headers["api-key"]).toBe("k-123456789");
    expect(body.messages[0]).toEqual({ role: "system", content: "s" });
    expect(body.tools[0].function.name).toBe("lookup");
    expect(r).toMatchObject({
      stopReason: "tool_use",
      toolCalls: [{ id: "c1", input: { q: "x" } }],
      usage: { inputTokens: 7 },
    });
  });
  it("normalizes HTTP errors with retry-after", async () => {
    const { fetch } = mockFetch({
      "/models/chat/completions": () => json({}, 429, { "retry-after": "2" }),
    });
    await expect(
      new AzureFoundryProvider({ ...base, fetch }).generate({
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 2000 });
  });
  it("requires https", () => {
    expect(() => new AzureFoundryProvider({ ...base, endpoint: "http://insecure" })).toThrow(
      /https/,
    );
  });
});

describe("registry", () => {
  it("returns null when nothing is configured", () => {
    expect(createProviderFromEnv({ env: {} })).toBeNull();
  });
  it("selects anthropic when a key is present", () => {
    expect(
      createProviderFromEnv({ env: { ANTHROPIC_API_KEY: "sk-ant-test-0000000000" } })?.id,
    ).toBe("anthropic");
  });
  it("rejects unknown providers", () => {
    expect(() => createProviderFromEnv({ env: { LLM_PROVIDER: "foo" } })).toThrow(/Unknown/);
  });
  it("meters usage per provider and model", () => {
    const m = new UsageMeter();
    const r = {
      provider: "anthropic" as const,
      model: "m",
      text: "",
      toolCalls: [],
      stopReason: "end" as const,
      usage: { inputTokens: 2, outputTokens: 3 },
      latencyMs: 1,
    };
    m.record(r);
    m.record(r);
    expect(m.snapshot()).toEqual({ "anthropic:m": { inputTokens: 4, outputTokens: 6, calls: 2 } });
  });
});
