---
paths:
  - "public/index.html"
  - "public/css/**"
  - "public/js/**"
  - "NOTES.md"
---

# Règles du chatbot académique (contrat EFREI J1)

- Ne jamais renommer les ids `historique`, `formulaire`, `message`, `envoyer`, `statut`, `compteur`, `effacer`, `contenu`, ni les classes et attributs `li.msg`, `data-role="user"|"bot"`.
- `brain.js` reste pur : pas de `document`, `window`, `Date`, `Math.random`. Signatures `validerMessage(texte, limite)` et `repondre(texte, regles, assistant)`.
- Scripts classiques uniquement (pas de `import`/`export`) pour fonctionner en `file://`. Aucun import depuis `src/`.
- Afficher les messages avec `textContent`, jamais `innerHTML`.
- Après toute modification : `npm run test:academic`, puis vérifier `docs/academic/contract-assumptions.md`.
