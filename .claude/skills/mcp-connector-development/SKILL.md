---
name: mcp-connector-development
description: "Add or change an MCP tool backed by a read-only connector (GitHub, Jira, SonarQube or traceability), with zod schemas and contract tests. Use when touching src/mcp or src/connectors."
---

# Mcp connector development

## When to use

Adding a tool to `src/mcp/server.ts` or an endpoint to a connector.

## Preconditions

- The official REST endpoint is identified and documented (URL of the API reference).
- Edition limits checked (Community vs commercial, Cloud vs Data Center).

## Inputs

- Tool name (`^[a-zA-Z0-9_-]{1,64}$`, underscores).
- Input schema, output shape, required permissions.

## Process

1. Fill `templates/mcp-connector-spec.md`: endpoint, auth, permissions, edition availability, error mapping.
2. Implement the connector method on `ReadOnlyHttpClient` (GET only). Validate inputs with zod before any network call.
3. Register the tool with `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` for external systems. Register it only when the connector is configured.
4. Add mocked tests in `tests/integration/connectors.test.ts` (success, 404, 429, invalid input).
5. Add a contract test in `tests/contracts/mcp.test.ts` with `InMemoryTransport`.
6. If credentials exist locally, add a live check in `tests/live/live.test.ts`.

## Success criteria

- `npm run test:integration` and `npm run test:contracts` pass.
- No mutating HTTP method is used.
- Availability per edition is documented.

## Deliverables

- Connector method, MCP tool, tests, updated `docs/architecture/integrations.md`.
