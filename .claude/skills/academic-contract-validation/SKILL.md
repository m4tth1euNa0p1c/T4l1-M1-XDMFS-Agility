---
name: academic-contract-validation
description: "Validate the EFREI J1 contract of the academic chatbot (HTML ids, brain.js and app.js signatures, limits, accessibility, file:// operation). Use before changing public/ or NOTES.md and before every PR."
---

# Academic contract validation

## When to use

Any change under `public/`, any change to `NOTES.md`, or before opening a pull request.

## Preconditions

- Dependencies installed (`npm ci`).
- Course documents checked: `CONTRAT.md`, `VARIANTE.md`, `J1-apres-midi_md.pdf`. If absent, use `docs/academic/contract-assumptions.md` and say so.

## Inputs

- The diff or the list of changed files.
- The contract source (course document or assumptions file).

## Process

1. Run `npm run test:academic` and keep the summary line.
2. Check that `public/js/brain.js` has no DOM, time or randomness: `grep -nE "document|window|Date|Math.random" public/js/brain.js` must only match comments.
3. Open `public/index.html` directly as a file (no server) and send `bonjour`, then `aide`: two `li.msg` per exchange, `#statut` updated.
4. Compare every id and signature with the contract source. Any difference is a FAIL, even if tests pass.
5. If a course document was added, update `tests/academic/` so the tests encode it.

## Success criteria

- All academic tests pass.
- No contract item is FAIL.
- The page works from `file://`.

## Deliverables

- A PASS/FAIL table per contract item with evidence.
- Updated academic tests when the contract changed.
