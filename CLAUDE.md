# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

XDMFS Agility is an EFREI M1 course project: a chatbot that answers Agile traceability questions across Jira, GitHub, SonarQube and deployments. Two strictly separated parts:

- **Academic core** in `public/index.html`, `public/css/style.css` and `public/js/`. These are classic browser scripts with no modules, so the page works from `file://` with no server and no AI. It is graded by an automatic checker.
- **Platform** in `src/`, written in TypeScript for Node 20. It holds the API, the dashboard backend, the LLM agent, connectors, the MCP server and SQLite memory. The dashboard UI lives in `public/tracabilite/` and calls the API.

`public/` never imports from `src/`. The course contract wins over any architecture preference.

## Commands

```bash
npm run dev                 # API + static pages on http://127.0.0.1:3000 (tsx)
npm run check               # lint, prettier check, typecheck, all mocked tests, build
npm test                    # vitest: academic, unit, integration, contracts
npm run test:academic       # J1 contract only
npx vitest run tests/unit/traceability.test.ts -t "Q6"   # single file / test name
npm run test:e2e            # Playwright, starts its own server on :3100 (LLM off)
npm run test:live           # real Anthropic/GitHub/SonarQube calls, local only, needs .env
npm run mcp                 # MCP stdio server (also declared in .mcp.json)
```

For live GitHub checks, run `GITHUB_TOKEN=$(gh auth token) npm run test:live`. Start the local SonarQube with `docker compose -f docker/docker-compose.sonarqube.yml up -d`, then follow `docs/runbooks/sonarqube.md`.

## Architecture

- **One snapshot format feeds everything.** Connectors and the demo both produce a `SyncSnapshot` (`src/traceability/snapshot.ts`). `buildGraph` (`builder.ts`) turns it into a `TraceGraph`. `SqliteTraceStore.saveSnapshot` persists it with upsert, stale marking and a sync cursor. `loadGraph` rebuilds it for queries.
- **Evidence model** (`model.ts`):
  - `verified` needs a method in `VERIFYING_METHODS`, evidence, and confidence 1.
  - Issue-key conventions in branches, commits and PR titles are always `inferred`.
  - A path takes the status of its weakest link.
  - These rules are enforced by zod and by SQLite CHECK constraints.
- **Questions** (`questions.ts`) return `{ data, sources, limitations, demo }`. `src/assistant/tools.ts` wraps them as `traceability_*` tools. The same tools are used by:
  - the deterministic router (`router.ts`),
  - the Claude agent loop (`agent.ts`),
  - the MCP server (`src/mcp/server.ts`),
  - `GET /api/projects/:id/tools/:name`.
- **`POST /api/projects/:id/ask`** uses the LLM when a provider is configured. In `auto` mode it falls back to the deterministic router on error.
- **Providers** implement `LLMProvider` (`src/providers/types.ts`). Anthropic is verified live. Bedrock and Azure are mocked only and say so in `capabilities()`. `createProviderFromEnv` returns null when nothing is configured.
- **Connectors** extend `ReadOnlyHttpClient`, which is GET-only and requires https outside localhost. MCP registers `jira_*` and `sonarqube_*` only when they are configured. Tool names use underscores, never dots.
- **Demo data:** the fictional bank project in `src/demo/bank-project.ts` is seeded at server start. Each scenario in it backs a test in `tests/unit/traceability.test.ts`.

## Rules

- The course documents (`CONTRAT.md`, `VARIANTE.md`, `J1-apres-midi_md.pdf`) are not in the repo yet. The assumed contract is in `docs/academic/contract-assumptions.md`. Never invent their content.
- Never rename the academic ids or classes, and keep `brain.js` pure. Path-scoped rules live in `.claude/rules/`.
- Render with `textContent`, never `innerHTML`. The CSP is `default-src 'self'`, so there are no CDNs and no inline scripts.
- Secrets live in `.env`, which is gitignored. Read variable names only and pass upstream errors through `redact()`.
- Schema changes are new entries in `src/memory/migrations.ts`.
- Never claim an integration works without a passing live test recorded in `docs/evidence/`.
- Git: work on `feature/*` branches and merge to `main` by pull request. Use Conventional Commits. Never merge without authorization.

## Factory

- Agents live in `.claude/agents/` and skills in `.claude/skills/`. Use the `spec-driven-development` skill for features.
- Specs go in `specs/`, templates in `templates/`, ADRs in `docs/adr/` and evidence in `docs/evidence/`.
