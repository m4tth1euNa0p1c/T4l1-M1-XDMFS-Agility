import { XdmfsError, codeFromStatus } from "../core/errors.js";
import { parseRetryAfter } from "../core/retry.js";
import {
  GenerationRequestSchema,
  type GenerationRequest,
  type GenerationResult,
  type LLMProvider,
  type Message,
  type ProviderCapabilities,
  type StopReason,
  type ToolCall,
} from "./types.js";

/**
 * Microsoft Azure AI Foundry adapter for the Model Inference
 * chat-completions endpoint (`/models/chat/completions`).
 *
 * Claude models deployed on Foundry expose the Anthropic Messages API
 * instead; for those, use AnthropicProvider with @anthropic-ai/foundry-sdk.
 *
 * Status: mapping verified with mocks only. Not tested against Azure.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface AzureFoundryOptions {
  endpoint?: string;
  apiKey?: string;
  deployment?: string;
  apiVersion?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export class AzureFoundryProvider implements LLMProvider {
  readonly id = "azure-foundry" as const;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: AzureFoundryOptions) {
    if (!options.endpoint || !options.apiKey || !options.deployment) {
      throw new XdmfsError(
        "not_configured",
        "azure-foundry",
        "AZURE_FOUNDRY_ENDPOINT, AZURE_FOUNDRY_API_KEY and AZURE_FOUNDRY_DEPLOYMENT are required.",
      );
    }
    const url = new URL(options.endpoint);
    if (url.protocol !== "https:") {
      throw new XdmfsError("invalid_request", "azure-foundry", "Endpoint must use https.");
    }
    this.endpoint = url.toString().replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.deployment = options.deployment;
    this.apiVersion = options.apiVersion ?? "2024-05-01-preview";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  capabilities(): ProviderCapabilities {
    return {
      provider: "azure-foundry",
      streaming: false,
      toolCalling: true,
      maxOutputTokens: 4096,
      verifiedAgainstRealService: false,
      notes: [
        "Chat-completions mapping tested with mocks only.",
        "Tool calling availability depends on the deployed model.",
      ],
    };
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const req = GenerationRequestSchema.parse(request);
    const messages: ChatMessage[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    for (const m of req.messages) messages.push(...toChatMessages(m));

    const body: Record<string, unknown> = {
      model: req.model ?? this.deployment,
      messages,
      max_tokens: req.maxTokens,
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: { type: "object", ...t.inputSchema },
        },
      }));
    }

    const url = `${this.endpoint}/models/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`;
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? this.timeoutMs),
      });
    } catch (error) {
      const timedOut = (error as { name?: string })?.name === "TimeoutError";
      throw new XdmfsError(
        timedOut ? "timeout" : "unavailable",
        "azure-foundry",
        "Request failed.",
        {
          cause: error,
        },
      );
    }

    if (!response.ok) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      throw new XdmfsError(
        codeFromStatus(response.status),
        "azure-foundry",
        `HTTP ${response.status}`,
        {
          status: response.status,
          ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
        },
      );
    }

    const json = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: ChatMessage; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = json.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      input: safeJson(c.function.arguments),
    }));
    return {
      provider: "azure-foundry",
      model: json.model ?? this.deployment,
      text: choice?.message?.content ?? "",
      toolCalls,
      stopReason: mapFinish(choice?.finish_reason),
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }
}

function toChatMessages(m: Message): ChatMessage[] {
  if (typeof m.content === "string") return [{ role: m.role, content: m.content }];
  const out: ChatMessage[] = [];
  const text = m.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
  const calls = m.content.filter((p) => p.type === "tool_use");
  if (text || calls.length) {
    const msg: ChatMessage = { role: m.role, content: text || null };
    if (calls.length) {
      msg.tool_calls = calls.map((p) => ({
        id: p.call.id,
        type: "function",
        function: { name: p.call.name, arguments: JSON.stringify(p.call.input) },
      }));
    }
    out.push(msg);
  }
  for (const p of m.content) {
    if (p.type === "tool_result")
      out.push({ role: "tool", content: p.content, tool_call_id: p.callId });
  }
  return out;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapFinish(reason: string | undefined): StopReason {
  switch (reason) {
    case "stop":
      return "end";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}
