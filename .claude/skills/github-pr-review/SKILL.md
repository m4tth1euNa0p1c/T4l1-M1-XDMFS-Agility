---
name: github-pr-review
description: "Review a pull request for correctness, academic compliance, security and evidence before merge. Use when a PR is opened or updated."
---

# Github pr review

## When to use

A pull request targets `main`.

## Preconditions

- `gh` authenticated.
- CI has run on the PR.

## Inputs

- PR number.

## Process

1. `gh pr view <n> --json title,body,files,commits` and `gh pr diff <n>`.
2. Check Conventional Commit titles and that no secret or `.env` file is in the diff.
3. Run the academic-contract-validation skill if `public/` changed.
4. Check CI status with `gh pr checks <n>`.
5. Fill `templates/pr-review.md`: findings ranked by severity, evidence, decision (approve, request changes).
6. Never merge without explicit authorization.

## Success criteria

- Every finding has a file and line.
- Decision is justified by checks and evidence.

## Deliverables

- Review report, optional PR comment after user approval.
