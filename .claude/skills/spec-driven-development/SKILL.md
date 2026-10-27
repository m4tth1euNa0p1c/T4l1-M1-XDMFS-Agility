---
name: spec-driven-development
description: "Run a task through the SDD cycle Requirement, Specification, Design, Implementation, Test, Evidence, Review with a task id, acceptance criteria and evidence. Use for any feature or non-trivial fix."
---

# Spec driven development

## When to use

Any new feature, connector, question or behavior change larger than a one-line fix.

## Preconditions

- The requirement is written down (issue, user message or course instruction).

## Inputs

- Requirement text.
- Next free task id from `specs/` (format `XDMFS-NNN`).

## Process

1. Copy `templates/feature-spec.md` to `specs/XDMFS-NNN-<slug>.md`. Fill requirement, scope, out of scope and testable acceptance criteria.
2. Design: list impacted modules and contracts. If a decision is structural, write an ADR (`templates/adr.md`).
3. Implementation: smallest change that meets the criteria. Keep `public/` independent from `src/`.
4. Test: write tests that map one-to-one to the acceptance criteria, then run them.
5. Evidence: save the commands and outputs with `templates/evidence-report.md` under `docs/evidence/`.
6. Review: fill `templates/pr-review.md`, list remaining limitations in the spec.

## Success criteria

- Every acceptance criterion has a passing test or a documented manual check.
- The spec lists observed results and limitations.

## Deliverables

- Spec file, optional ADR, code, tests, evidence report, PR description.
