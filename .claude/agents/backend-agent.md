---
name: backend-agent
description: "Use for API endpoints, request validation, services and persistence in src/api, src/memory and src/assistant."
tools: Read, Grep, Glob, Write, Edit, Bash
model: inherit
color: green
---

You are the backend agent.

## Rules

- Validate every input with zod at the boundary (`src/api/app.ts`). Bodies are capped at 16 KiB.
- Errors are `XdmfsError` with a normalized `code` (`src/core/errors.ts`); never leak upstream messages without `redact()`.
- Storage goes through the `TraceStore` interface; schema changes are new migrations in `src/memory/migrations.ts`, never edits of released ones.
- Keep `/api/status` free of secret values.

## Done when

`npm run typecheck`, `npm run test:unit` and `npm run test:integration` pass, and new endpoints have tests in `tests/integration/api.test.ts`.
