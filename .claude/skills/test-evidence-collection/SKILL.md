---
name: test-evidence-collection
description: "Run the test suites and record reproducible evidence (command, date, summary, failures) under docs/evidence. Use at the end of each phase and before a PR."
---

# Test evidence collection

## When to use

End of a task or phase, before a PR, after fixing a failing test.

## Preconditions

- Dependencies installed.
- For live tests: `.env` present and Docker SonarQube running if needed.

## Inputs

- Scope: academic, unit, integration, contracts, e2e, live.

## Process

1. Run `npm run check` and capture the summary lines.
2. Run `npm run test:e2e` when the scope includes UI.
3. Run `npm run test:live` locally when credentials exist; redact tokens from the output.
4. Write the report with `templates/evidence-report.md` in `docs/evidence/YYYY-MM-DD-<scope>.md`.
5. Report failures as failures, with output.

## Success criteria

- Every claim in the PR maps to a command and its output in the report.

## Deliverables

- Evidence report and raw output files in `docs/evidence/`.
