import { z } from "zod";

/**
 * Provider-neutral contract. Each adapter translates to and from its
 * vendor format; nothing vendor-specific leaks past this file.
 */

export const ToolDefinitionSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  description: z.string().min(1).max(1024),
  /** JSON Schema (object) for the tool input. */
  inputSchema: z.record(z.string(), z.unknown()),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

const TextPart = z.object({ type: z.literal("text"), text: z.string() });
const ToolUsePart = z.object({ type: z.literal("tool_use"), call: ToolCallSchema });
const ToolResultPart = z.object({
  type: z.literal("tool_result"),
  callId: z.string(),
  content: z.string(),
  isError: z.boolean().default(false),
});
export const MessagePartSchema = z.discriminatedUnion("type", [
  TextPart,
  ToolUsePart,
  ToolResultPart,
]);
export type MessagePart = z.infer<typeof MessagePartSchema>;

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string().min(1), z.array(MessagePartSchema).min(1)]),
});
export type Message = z.infer<typeof MessageSchema>;

export const GenerationRequestSchema = z.object({
  /** Overrides the provider's configured model. */
  model: z.string().min(1).optional(),
  system: z.string().optional(),
  messages: z.array(MessageSchema).min(1),
  maxTokens: z.number().int().positive().max(128_000).default(4096),
  tools: z.array(ToolDefinitionSchema).max(64).optional(),
  /** Per-request timeout in milliseconds. */
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  /** Free-form effort hint; adapters map or ignore it. */
  effort: z.enum(["low", "medium", "high"]).optional(),
});
export type GenerationRequest = z.input<typeof GenerationRequestSchema>;
export type ParsedGenerationRequest = z.output<typeof GenerationRequestSchema>;

export type StopReason = "end" | "max_tokens" | "tool_use" | "refusal" | "other";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export interface GenerationResult {
  provider: ProviderId;
  model: string;
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: Usage;
  latencyMs: number;
}

export type GenerationChunk =
  { type: "text"; text: string } | { type: "done"; result: GenerationResult };

export type ProviderId = "anthropic" | "bedrock" | "azure-foundry" | "mock";

export interface ProviderCapabilities {
  provider: ProviderId;
  streaming: boolean;
  toolCalling: boolean;
  maxOutputTokens: number;
  /** True only after a real call has succeeded (see docs/evidence). */
  verifiedAgainstRealService: boolean;
  notes: string[];
}

export interface LLMProvider {
  readonly id: ProviderId;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  stream?(request: GenerationRequest): AsyncIterable<GenerationChunk>;
  capabilities(): ProviderCapabilities;
}

/** Consumption metrics aggregated per provider and model. */
export class UsageMeter {
  private readonly totals = new Map<string, Usage & { calls: number }>();

  record(result: GenerationResult): void {
    const key = `${result.provider}:${result.model}`;
    const current = this.totals.get(key) ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
    current.inputTokens += result.usage.inputTokens;
    current.outputTokens += result.usage.outputTokens;
    current.calls += 1;
    this.totals.set(key, current);
  }

  snapshot(): Record<string, Usage & { calls: number }> {
    return Object.fromEntries([...this.totals].map(([k, v]) => [k, { ...v }]));
  }
}
