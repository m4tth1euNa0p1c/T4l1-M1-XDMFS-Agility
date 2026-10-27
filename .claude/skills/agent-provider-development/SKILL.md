---
name: agent-provider-development
description: "Add or change an LLM provider adapter (Anthropic, AWS Bedrock, Azure AI Foundry) behind the LLMProvider interface, with capability flags and mocked tests. Use when touching src/providers."
---

# Agent provider development

## When to use

New provider, new capability (streaming, tools), or error mapping change.

## Preconditions

- Official SDK or API reference identified; never guess SDK names.
- Credentials only in `.env`, never printed.

## Inputs

- Provider id, model id, auth method, supported capabilities.

## Process

1. Implement `LLMProvider` from `src/providers/types.ts`. Validate requests with `GenerationRequestSchema`.
2. Map vendor stop reasons to `end | max_tokens | tool_use | refusal | other` and vendor errors to `XdmfsError` codes.
3. Inject the transport (client, fetch) so tests run without network.
4. Set `capabilities().verifiedAgainstRealService` to false until a live test passes.
5. Add tests in `tests/unit/providers.test.ts`: request mapping, tool calls, errors, missing configuration.
6. Wire it in `src/providers/registry.ts` behind `LLM_PROVIDER`.

## Success criteria

- Unit tests pass.
- No claim of operational status without a passing live test recorded in `docs/evidence/`.

## Deliverables

- Adapter, tests, registry entry, provider notes in `docs/architecture/providers.md`.
