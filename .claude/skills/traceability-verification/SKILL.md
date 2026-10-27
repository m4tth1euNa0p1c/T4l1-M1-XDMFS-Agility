---
name: traceability-verification
description: "Verify traceability answers and correlation rules: verified vs inferred vs unknown, weakest-link paths, sources and limitations. Use when changing src/traceability or answering delivery questions."
---

# Traceability verification

## When to use

Changing correlation rules, adding a business question, or reviewing an answer about tickets, PRs, quality or deployments.

## Preconditions

- Graph built from a snapshot (demo or live) with `buildGraph`.

## Inputs

- Question or rule change.
- Snapshot used as evidence.

## Process

1. Check that every `verified` relation uses a method in `VERIFYING_METHODS` and has evidence.
2. Check that issue-to-code links are `inferred` unless an explicit API link exists.
3. For each answer, confirm `sources` and `limitations` are present and that demo data is flagged.
4. Check the two classic traps: CI success counted as deployment, quality gate counted as functional validation.
5. Add or update a scenario in `src/demo/bank-project.ts` and a test in `tests/unit/traceability.test.ts`.

## Success criteria

- `npm run test:unit` passes.
- No inferred link is presented as certain.

## Deliverables

- Test cases, updated questions, explanation of each status in the answer.
