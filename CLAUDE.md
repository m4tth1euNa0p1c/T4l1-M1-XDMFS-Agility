# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

XDMFS Agility is an EFREI M1 course project: a chatbot web app that will improve traceability across Jira, GitHub and SonarQube. It has two strictly separated parts:

- **A. Academic Chatbot Core**: plain HTML/CSS/JavaScript in `public/`, graded by an automatic checker. It must work with no server and no AI API.
- **B. XDMFS Agentic Platform**: everything in `src/` (LLM providers, MCP connectors, traceability engine, memory). B must never break A, and A must never import from B.

The course requirements take precedence over any architectural preference.

## Current state

As of 2026-10-27 the remote repository is empty. No `package.json`, tests, CI or source code exist yet. Update this file whenever commands or structure become real. Do not document a command here until it has actually run.

## Authoritative course documents

`CONTRAT.md`, `VARIANTE.md`, `J1-apres-midi_md.pdf` and the J2 to J4 instructions define the graded contract. **None of them are in the repository or the local workspace yet.** Ask for them before finalizing anything in Part A. Never invent their content. When they arrive, the exact IDs, file paths and function signatures in `CONTRAT.md` override everything below.

Known J1 contract, as stated by the project owner (verify against `CONTRAT.md`):

- `public/index.html`: `main`, `h1`, `ul#historique` with `aria-live`, `form#formulaire`, `#message` (`required`, `maxlength`), button `#envoyer`. Bonus: skip link to `#contenu`.
- `public/css/style.css`: responsive 360 to 1280 px, text contrast at least 4.5:1, visible keyboard focus, 200-character unbroken words must wrap. Bonus: dark theme.
- `brain.js`: pure functions `validerMessage(texte, limite)` and `repondre(texte, regles, assistant)`. No DOM access, deterministic, unit tested. Bonus: case- and accent-insensitive matching.
- `app.js`: the only file that touches the DOM. Send on click and Enter, render `li.msg` with `data-role="user"` or `data-role="bot"`, update `#statut` and `#compteur`. Bonus: `#effacer`.
- `NOTES.md`: answers why `brain.js` avoids the DOM, the full path of a message, and which test was useful. Only cite tests that were actually run.

The exact locations of `brain.js` and `app.js` are imposed by the contract. Do not move academic files to fit the target layout of Part B.

## Part B design rules

- **LLM providers** implement one `LLMProvider` interface (`generate`, optional `stream`, `capabilities`). Anthropic is the first real adapter. AWS Bedrock and Azure AI Foundry get dedicated adapters, since their tool-calling and streaming capabilities differ. A provider counts as operational only after a real call succeeds.
- **MCP connectors** wrap the official REST APIs of GitHub, Jira and SonarQube behind a local MCP server. Tool names such as `github.list_pull_requests` or `traceability.get_issue_delivery_chain` are proposed contracts, not existing APIs. Connectors are read-only by default. Any external mutation needs explicit authorization.
- **Traceability graph** links Issue, Branch, Commit, PullRequest, Build, QualityGate, Deployment and Release. Every edge records its source, source and target IDs, observation date, correlation method, confidence and a verifiable reference. Edges are `verified`, `inferred` or `unknown`. Never promote an inferred edge to verified. A green workflow is not a deployment, and a passing SonarQube analysis is not functional validation.
- **Persistence** uses SQLite behind a replaceable storage interface, with versioned migrations, provenance, cache TTLs and deduplication. No vector or graph database without a demonstrated need.
- Jira, SonarQube, Bedrock and Azure must not be described as working unless they are configured and tested.

## Secrets

- Only read the names of environment variables, never their values. Never print, log or commit them.
- The developer keeps a `.env` one level above the repo, outside version control. Its current key name uses hyphens, which is not a valid shell variable name. The app should read `ANTHROPIC_API_KEY`, documented in `.env.example` with a placeholder.
- `.env` and all secret files must stay in `.gitignore`.
- Do not reuse Claude Code's own credentials as application credentials.

## Workflow

- Development cycle: Requirement, Specification, Design, Implementation, Test, Evidence, Review. Each task gets an ID, a spec with acceptance criteria, a test strategy, observed results and remaining limitations.
- Specs live in `specs/`, reusable templates in `templates/`, ADRs in `docs/adr/`, test evidence in `docs/evidence/`.
- Claude Code agents, skills and commands live in `.claude/agents/`, `.claude/skills/<name>/SKILL.md` and `.claude/commands/`. Use only frontmatter fields supported by the installed Claude Code version.
- Every claim that something works must be backed by a reproducible command and its output.

## Git

- `main` gets a minimal working skeleton first. Feature work happens on branches such as `feature/agentic-factory-bootstrap`, merged through a pull request after validation.
- Never push unvalidated experimental code directly to `main`. Never merge without authorization.
- Commit messages follow Conventional Commits, for example `feat: implement deterministic chatbot`.
- CI must not depend on a paid API for the academic tests. Use minimal GitHub Actions permissions and pinned third-party actions.
