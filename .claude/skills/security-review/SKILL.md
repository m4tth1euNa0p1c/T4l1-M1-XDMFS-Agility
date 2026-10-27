---
name: security-review
description: "Assess secrets handling, permissions, input validation, injection and supply-chain risks of the current changes. Use before a PR and when touching auth, connectors, API, LLM tools or CI."
---

# Security review

## When to use

Changes to `src/api`, `src/connectors`, `src/providers`, `src/security`, `.github/workflows` or dependencies.

## Preconditions

- Diff available.

## Inputs

- Diff or file list.

## Process

1. Search for secret shapes in the diff and history: `git log -p | grep -nE "sk-ant|ghp_|github_pat_|squ_"` must return nothing.
2. Confirm `.env` is ignored: `git check-ignore .env`.
3. Check validation at every boundary (zod), static path traversal, body limit, rate limit.
4. Check that connectors use GET only and https outside localhost.
5. Check that the LLM agent tool list contains no mutating tool.
6. Run `npm audit --omit=dev` and record the result.
7. Fill `templates/security-assessment.md`.

## Success criteria

- No high severity finding left open without an explicit decision.

## Deliverables

- Security assessment with findings and evidence.
