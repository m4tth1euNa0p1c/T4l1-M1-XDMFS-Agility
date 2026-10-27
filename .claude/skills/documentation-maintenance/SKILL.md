---
name: documentation-maintenance
description: "Keep README, CLAUDE.md, NOTES.md, architecture docs and ADRs consistent with the actual code and commands. Use after any behavior, command or structure change."
---

# Documentation maintenance

## When to use

After merging a feature, changing a script, or adding a module.

## Preconditions

- The change is implemented and tested.

## Inputs

- Diff and evidence report.

## Process

1. Update commands only from `package.json` scripts that were run successfully.
2. Update `docs/architecture/*.md` when modules or contracts change.
3. Mark anything not verified against a real service as such.
4. Check NOTES.md answers still match the code paths of the chatbot.
5. Keep CLAUDE.md short: commands, architecture, rules.

## Success criteria

- No doc refers to a file, script or flag that does not exist.

## Deliverables

- Updated docs in the same PR as the change.
