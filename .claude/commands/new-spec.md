---
description: Crée une spécification SDD numérotée à partir d'un besoin
argument-hint: "<besoin en une phrase>"
---

Besoin : $ARGUMENTS

1. Trouve le prochain identifiant libre `XDMFS-NNN` dans `specs/`.
2. Copie `templates/feature-spec.md` vers `specs/XDMFS-NNN-<slug>.md` et remplis : requirement, scope, critères d'acceptation testables, design, fichiers, stratégie de test.
3. Si une décision structurante apparaît, propose un ADR à partir de `templates/adr.md`.
4. N'implémente rien : présente la spec pour validation.
