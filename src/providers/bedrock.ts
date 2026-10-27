import { XdmfsError } from "../core/errors.js";
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
 * Amazon Bedrock adapter using the Converse API request/response shapes.
 *
 * The AWS SDK is NOT a dependency: callers inject a transport, e.g.
 *   const client = new BedrockRuntimeClient({ region });
 *   transport = { converse: (input) => client.send(new ConverseCommand(input)) };
 *
 * Status: mapping verified with mocks only. Not tested against AWS.
 */

export interface BedrockContentBlock {
  text?: string;
  toolUse?: { toolUseId: string; name: string; input: unknown };
  toolResult?: {
    toolUseId: string;
    content: Array<{ text: string }>;
    status?: "success" | "error";
  };
}

export interface BedrockConverseInput {
  modelId: string;
  messages: Array<{ role: "user" | "assistant"; content: BedrockContentBlock[] }>;
  system?: Array<{ text: string }>;
  inferenceConfig?: { maxTokens?: number };
  toolConfig?: {
    tools: Array<{
      toolSpec: { name: string; description: string; inputSchema: { json: unknown } };
    }>;
  };
}

export interface BedrockConverseOutput {
  output?: { message?: { role: string; content?: BedrockContentBlock[] } };
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface BedrockTransport {
  converse(
    input: BedrockConverseInput,
    options: { timeoutMs: number },
  ): Promise<BedrockConverseOutput>;
}

export interface BedrockProviderOptions {
  modelId?: string;
  region?: string;
  timeoutMs?: number;
  transport?: BedrockTransport;
}

export class BedrockProvider implements LLMProvider {
  readonly id = "bedrock" as const;
  private readonly transport: BedrockTransport;
  private readonly modelId: string;
  private readonly timeoutMs: number;

  constructor(options: BedrockProviderOptions) {
    if (!options.transport) {
      throw new XdmfsError(
        "not_configured",
        "bedrock",
        "No Bedrock transport injected. Install @aws-sdk/client-bedrock-runtime and pass a transport.",
      );
    }
    if (!options.modelId) {
      throw new XdmfsError("not_configured", "bedrock", "BEDROCK_MODEL_ID is not set.");
    }
    this.transport = options.transport;
    this.modelId = options.modelId;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  capabilities(): ProviderCapabilities {
    return {
      provider: "bedrock",
      streaming: false,
      toolCalling: true,
      maxOutputTokens: 8192,
      verifiedAgainstRealService: false,
      notes: [
        "Converse API mapping tested with mocks only.",
        "Streaming (ConverseStream) not implemented.",
        "Tool calling depends on the selected model; check the Bedrock model card.",
      ],
    };
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const req = GenerationRequestSchema.parse(request);
    const input: BedrockConverseInput = {
      modelId: req.model ?? this.modelId,
      messages: req.messages.map(toBedrockMessage),
      inferenceConfig: { maxTokens: req.maxTokens },
    };
    if (req.system) input.system = [{ text: req.system }];
    if (req.tools?.length) {
      input.toolConfig = {
        tools: req.tools.map((t) => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: { json: { type: "object", ...t.inputSchema } },
          },
        })),
      };
    }

    const started = Date.now();
    let output: BedrockConverseOutput;
    try {
      output = await this.transport.converse(input, { timeoutMs: req.timeoutMs ?? this.timeoutMs });
    } catch (error) {
      throw normalizeBedrockError(error);
    }

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of output.output?.message?.content ?? []) {
      if (typeof block.text === "string") text += block.text;
      if (block.toolUse) {
        toolCalls.push({
          id: block.toolUse.toolUseId,
          name: block.toolUse.name,
          input: (block.toolUse.input ?? {}) as Record<string, unknown>,
        });
      }
    }
    return {
      provider: "bedrock",
      model: input.modelId,
      text,
      toolCalls,
      stopReason: mapStop(output.stopReason),
      usage: {
        inputTokens: output.usage?.inputTokens ?? 0,
        outputTokens: output.usage?.outputTokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }
}

function toBedrockMessage(m: Message): BedrockConverseInput["messages"][number] {
  if (typeof m.content === "string") return { role: m.role, content: [{ text: m.content }] };
  return {
    role: m.role,
    content: m.content.map((p): BedrockContentBlock => {
      if (p.type === "text") return { text: p.text };
      if (p.type === "tool_use") {
        return { toolUse: { toolUseId: p.call.id, name: p.call.name, input: p.call.input } };
      }
      return {
        toolResult: {
          toolUseId: p.callId,
          content: [{ text: p.content }],
          status: p.isError ? "error" : "success",
        },
      };
    }),
  };
}

function mapStop(reason: string | undefined): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    case "guardrail_intervened":
    case "content_filtered":
      return "refusal";
    default:
      return "other";
  }
}

export function normalizeBedrockError(error: unknown): XdmfsError {
  const name = (error as { name?: string })?.name ?? "";
  const message = error instanceof Error ? error.message : String(error);
  const map: Record<string, ConstructorParameters<typeof XdmfsError>[0]> = {
    ThrottlingException: "rate_limited",
    ServiceQuotaExceededException: "quota_exceeded",
    AccessDeniedException: "permission_denied",
    UnrecognizedClientException: "authentication",
    ValidationException: "invalid_request",
    ResourceNotFoundException: "not_found",
    ModelTimeoutException: "timeout",
    ServiceUnavailableException: "unavailable",
    ModelNotReadyException: "unavailable",
  };
  return new XdmfsError(
    map[name] ?? "upstream_error",
    "bedrock",
    `${name || "Error"}: ${message}`,
    {
      cause: error,
    },
  );
}
