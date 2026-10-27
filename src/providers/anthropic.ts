import Anthropic from "@anthropic-ai/sdk";
import { XdmfsError } from "../core/errors.js";
import { redact } from "../security/secrets.js";
import {
  GenerationRequestSchema,
  type GenerationChunk,
  type GenerationRequest,
  type GenerationResult,
  type LLMProvider,
  type Message,
  type ParsedGenerationRequest,
  type ProviderCapabilities,
  type StopReason,
  type ToolCall,
} from "./types.js";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Subset of the SDK client used by the adapter, so tests can inject a fake. */
export interface AnthropicMessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number; headers?: Record<string, string> },
    ): Promise<Anthropic.Message>;
    stream(
      body: Anthropic.MessageCreateParamsStreaming | Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number; headers?: Record<string, string> },
    ): AsyncIterable<Anthropic.MessageStreamEvent> & { finalMessage(): Promise<Anthropic.Message> };
  };
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Retries are delegated to the SDK (408/409/429/5xx, connection errors). */
  maxRetries?: number;
  client?: AnthropicMessagesClient;
  /**
   * Server-side refusal fallback (beta server-side-fallback-2026-07-01,
   * fallbacks: "default"). On by default; set false to disable.
   */
  refusalFallback?: boolean;
}

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  private readonly client: AnthropicMessagesClient;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly refusalFallback: boolean;

  constructor(options: AnthropicProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.refusalFallback = options.refusalFallback ?? true;
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) {
        throw new XdmfsError("not_configured", "anthropic", "ANTHROPIC_API_KEY is not set.");
      }
      this.client = new Anthropic({
        apiKey: options.apiKey,
        maxRetries: options.maxRetries ?? 2,
        timeout: this.timeoutMs,
      }) as unknown as AnthropicMessagesClient;
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      provider: "anthropic",
      streaming: true,
      toolCalling: true,
      maxOutputTokens: 128_000,
      verifiedAgainstRealService: true,
      notes: [
        "Verified by tests/live/anthropic.live.test.ts (see docs/evidence).",
        "Large max_tokens values require streaming to avoid HTTP timeouts.",
      ],
    };
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const parsed = GenerationRequestSchema.parse(request);
    const started = Date.now();
    try {
      const message = await this.client.messages.create(this.toBody(parsed), {
        timeout: parsed.timeoutMs ?? this.timeoutMs,
        ...this.requestHeaders(),
      });
      return this.fromMessage(message, Date.now() - started);
    } catch (error) {
      throw normalizeAnthropicError(error);
    }
  }

  async *stream(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const parsed = GenerationRequestSchema.parse(request);
    const started = Date.now();
    try {
      const stream = this.client.messages.stream(this.toBody(parsed), {
        timeout: parsed.timeoutMs ?? this.timeoutMs,
        ...this.requestHeaders(),
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield { type: "done", result: this.fromMessage(final, Date.now() - started) };
    } catch (error) {
      throw normalizeAnthropicError(error);
    }
  }

  private toBody(req: ParsedGenerationRequest): Anthropic.MessageCreateParamsNonStreaming {
    const body: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model ?? this.model,
      max_tokens: req.maxTokens,
      messages: req.messages.map(toAnthropicMessage),
    };
    if (req.system) body.system = req.system;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: { type: "object", ...t.inputSchema } as Anthropic.Tool.InputSchema,
      }));
    }
    if (this.refusalFallback) {
      (body as unknown as Record<string, unknown>).fallbacks = "default";
    }
    if (req.effort) {
      (body as unknown as Record<string, unknown>).output_config = { effort: req.effort };
    }
    return body;
  }

  private requestHeaders(): { headers?: Record<string, string> } {
    return this.refusalFallback ? { headers: { "anthropic-beta": FALLBACK_BETA } } : {};
  }

  private fromMessage(message: Anthropic.Message, latencyMs: number): GenerationResult {
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }
    return {
      provider: "anthropic",
      model: message.model,
      text,
      toolCalls,
      stopReason: mapStopReason(message.stop_reason),
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      },
      latencyMs,
    };
  }
}

function toAnthropicMessage(m: Message): Anthropic.MessageParam {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  const content: Anthropic.ContentBlockParam[] = m.content.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "tool_use":
        return { type: "tool_use", id: part.call.id, name: part.call.name, input: part.call.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: part.callId,
          content: part.content,
          is_error: part.isError,
        };
    }
  });
  return { role: m.role, content };
}

function mapStopReason(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

/** Maps SDK typed errors (most specific first) to the normalized model. */
export function normalizeAnthropicError(error: unknown): XdmfsError {
  if (error instanceof XdmfsError) return error;
  const msg = (e: unknown) => redact(e instanceof Error ? e.message : String(e));
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new XdmfsError("timeout", "anthropic", "Request timed out.", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new XdmfsError("unavailable", "anthropic", "Connection error.", { cause: error });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new XdmfsError("authentication", "anthropic", "Invalid API key.", { status: 401 });
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new XdmfsError("permission_denied", "anthropic", msg(error), { status: 403 });
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new XdmfsError("not_found", "anthropic", msg(error), { status: 404 });
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = Number(error.headers?.get?.("retry-after"));
    return new XdmfsError("rate_limited", "anthropic", "Rate limit reached.", {
      status: 429,
      ...(Number.isFinite(retryAfter) ? { retryAfterMs: retryAfter * 1000 } : {}),
    });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new XdmfsError("invalid_request", "anthropic", msg(error), { status: 400 });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    const code = status === 529 || status === 503 ? "unavailable" : "upstream_error";
    return new XdmfsError(code, "anthropic", msg(error), { status });
  }
  return new XdmfsError("upstream_error", "anthropic", msg(error), { cause: error });
}
