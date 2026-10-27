---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Règles de la plateforme

- Valider toute donnée externe avec zod à la frontière. Erreurs en `XdmfsError` avec un `code` normalisé.
- Connecteurs : `ReadOnlyHttpClient` uniquement (GET). Aucune mutation externe sans ADR et autorisation explicite.
- Traçabilité : un lien déduit d'une convention reste `inferred`. Toute réponse porte `sources` et `limitations`.
- Base : nouvelle migration pour tout changement de schéma, jamais de modification d'une migration publiée.
- Secrets : lire les noms de variables, jamais les valeurs ; passer les messages d'erreur amont par `redact()`.
- Les tests mockés ne font aucun appel réseau ; les appels réels vont dans `tests/live/` (jamais en CI).
