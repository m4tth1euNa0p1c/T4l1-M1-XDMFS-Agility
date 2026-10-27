import type { TraceGraph } from "../traceability/graph.js";
import type { LLMProvider, Message, MessagePart, UsageMeter } from "../providers/types.js";
import { redact } from "../security/secrets.js";
import { runTraceTool, toolDefinitions } from "./tools.js";

/**
 * LLM agent: the model answers by calling the traceability tools. It never
 * sees raw connector credentials and has no write tool.
 */

const SYSTEM_PROMPT = `Tu es l'assistant de traçabilité XDMFS Agility. Tu réponds en français, de façon brève et factuelle.

Tu disposes d'outils qui interrogent un graphe de traçabilité (Jira, GitHub, SonarQube, déploiements). Utilise-les pour chaque question factuelle ; n'invente jamais un ticket, un commit, une PR ou un déploiement.

Règles de réponse :
- Distingue les liens "verified" (preuve explicite d'une API) des liens "inferred" (déduits d'une clé dans un nom de branche ou un message de commit). Ne présente jamais un lien inferred comme certain.
- Un workflow CI réussi n'est pas un déploiement. Une quality gate SonarQube réussie n'est pas une validation fonctionnelle.
- Termine par une ligne "Sources :" (identifiants de tickets, PR ou déploiements) et une ligne "Limites :" reprenant les limites renvoyées par les outils.
- Si le champ demo vaut true, précise que les données sont fictives.
- Si aucune donnée ne permet de répondre, dis-le.`;

export interface AgentAnswer {
  mode: "llm";
  text: string;
  toolCalls: Array<{ name: string; input: unknown; ok: boolean }>;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}

export async function answerWithAgent(
  provider: LLMProvider,
  graph: TraceGraph,
  projectId: string,
  question: string,
  options: { maxTurns?: number; meter?: UsageMeter; maxTokens?: number } = {},
): Promise<AgentAnswer> {
  const maxTurns = options.maxTurns ?? 5;
  const tools = toolDefinitions();
  const messages: Message[] = [{ role: "user", content: question }];
  const calls: AgentAnswer["toolCalls"] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let model = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await provider.generate({
      system: SYSTEM_PROMPT,
      messages,
      tools,
      maxTokens: options.maxTokens ?? 4096,
      effort: "low",
    });
    options.meter?.record(result);
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    model = result.model;

    if (result.stopReason === "refusal") {
      return {
        mode: "llm",
        text: "Le modèle a refusé de répondre à cette demande.",
        toolCalls: calls,
        model,
        usage,
        stopReason: "refusal",
      };
    }
    if (result.stopReason !== "tool_use" || result.toolCalls.length === 0) {
      return {
        mode: "llm",
        text: result.text.trim(),
        toolCalls: calls,
        model,
        usage,
        stopReason: result.stopReason,
      };
    }

    const assistantParts: MessagePart[] = [];
    if (result.text) assistantParts.push({ type: "text", text: result.text });
    for (const call of result.toolCalls) assistantParts.push({ type: "tool_use", call });
    messages.push({ role: "assistant", content: assistantParts });

    // All tool results go back in a single user message.
    const resultParts: MessagePart[] = result.toolCalls.map((call) => {
      try {
        const output = runTraceTool(graph, projectId, call.name, call.input);
        calls.push({ name: call.name, input: call.input, ok: true });
        return {
          type: "tool_result",
          callId: call.id,
          content: JSON.stringify(output),
          isError: false,
        };
      } catch (error) {
        calls.push({ name: call.name, input: call.input, ok: false });
        return {
          type: "tool_result",
          callId: call.id,
          content: redact(error instanceof Error ? error.message : String(error)),
          isError: true,
        };
      }
    });
    messages.push({ role: "user", content: resultParts });
  }
  return {
    mode: "llm",
    text: "Nombre maximal d'étapes atteint sans réponse finale.",
    toolCalls: calls,
    model,
    usage,
    stopReason: "max_turns",
  };
}
