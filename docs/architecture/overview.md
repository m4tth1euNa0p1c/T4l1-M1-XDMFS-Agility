# Architecture XDMFS Agility

## Vue d'ensemble

```text
                 ┌──────────────────────────── public/ (aucun import de src/) ─────────────┐
 Navigateur ───► │ index.html + js/brain.js + js/app.js      chatbot J1, fonctionne en file:// │
                 │ tracabilite/ (index.html, app.js)         tableau de bord, appelle /api     │
                 └──────────────────────────────────────────────────────────────────────────┘
                                           │ fetch /api/...
                 ┌─────────────────────── src/ (Node 20, TypeScript) ───────────────────────┐
                 │ api/        serveur node:http, CSP, zod, rate limit, fichiers statiques    │
                 │ assistant/  routeur déterministe, agent LLM à outils, outils partagés      │
                 │ traceability/ modèle, graphe, builder, questions métier                    │
                 │ memory/     TraceStore (SQLite), migrations, cache TTL, mémoire d'agents   │
                 │ providers/  LLMProvider : Anthropic (réel), Bedrock, Azure (mocks)         │
                 │ connectors/ GitHub, Jira, SonarQube sur ReadOnlyHttpClient (GET)           │
                 │ mcp/        serveur MCP stdio exposant les outils en lecture seule         │
                 │ security/   secrets (noms seulement), redaction, rate limiter              │
                 │ demo/       projet bancaire fictif Aurore Pay                              │
                 └──────────────────────────────────────────────────────────────────────────┘
```

## Flux d'une question au tableau de bord

1. `public/tracabilite/app.js` envoie `POST /api/projects/:id/ask` avec `{ question, mode }`.
2. `src/api/app.ts` valide le corps (zod, 16 Kio max), applique le rate limit, charge le graphe depuis SQLite.
3. Mode `llm` (ou `auto` avec un fournisseur) : `answerWithAgent` donne au modèle les outils `traceability_*`. Le modèle appelle les outils, reçoit du JSON, rédige la réponse avec sources et limites. En cas d'erreur en mode `auto`, repli déterministe.
4. Mode déterministe : `routeQuestion` choisit l'outil par mots-clés, `summarize` produit une phrase en français.
5. Le front affiche la réponse avec `textContent`, les sources et les limites.

## Flux de synchronisation

Connecteurs → `SyncSnapshot` (`src/traceability/snapshot.ts`) → `buildGraph` → `SqliteTraceStore.saveSnapshot` (upsert, stale, curseur). Le projet de démonstration suit exactement le même chemin.

## Décisions

Voir `docs/adr/`. Intégrations : `integrations.md`. Fournisseurs : `providers.md`.
