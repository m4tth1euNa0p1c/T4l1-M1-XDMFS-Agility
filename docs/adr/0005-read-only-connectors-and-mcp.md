# ADR-0005 : Connecteurs en lecture seule exposés par un serveur MCP local

- Statut : Accepted
- Date : 2026-10-27

## Contexte

Un serveur MCP n'est pas l'API REST d'un produit. Les connecteurs doivent pouvoir servir l'API web, l'agent LLM et des clients MCP (Claude Code).

## Décision

- Connecteurs REST officiels sur `ReadOnlyHttpClient` : GET uniquement, https hors localhost, timeouts, retries sur 429/5xx, chemins validés.
- Serveur MCP stdio (`src/mcp/server.ts`) : outils `traceability_*` toujours présents ; `github_*`, `jira_*`, `sonarqube_*` enregistrés seulement si configurés.
- Noms d'outils avec underscores (`^[a-zA-Z0-9_-]{1,64}$`) : l'API Anthropic refuse les points. Les noms proposés (`github.list_pull_requests`) deviennent `github_list_pull_requests`.
- Annotations `readOnlyHint: true`, `destructiveHint: false`.

## Conséquences

Toute mutation externe exigera un nouvel ADR et une autorisation explicite.
