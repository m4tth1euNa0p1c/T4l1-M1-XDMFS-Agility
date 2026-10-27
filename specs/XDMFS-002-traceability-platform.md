# XDMFS-002 : Plateforme de traçabilité (providers, connecteurs, MCP, graphe, mémoire)

| Champ       | Valeur                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Identifiant | XDMFS-002                                                                                          |
| Statut      | Verified (périmètre bootstrap)                                                                     |
| Agents      | architecture, backend, mcp-engineer, github/jira/sonarqube-integration, traceability, security, qa |
| Date        | 2026-10-27                                                                                         |

## 1. Requirement

Sections 5 à 8 du brief : abstraction multi-fournisseur, couche MCP lecture seule, moteur de traçabilité typé, mémoire persistante, questions métier avec sources et limites.

## 3. Acceptance criteria

- [x] AC1 : `LLMProvider` typé et validé ; Anthropic vérifié en réel ; Bedrock et Azure testés par mocks et déclarés non vérifiés.
- [x] AC2 : connecteurs GitHub, Jira, SonarQube en GET uniquement, erreurs normalisées, retries contrôlés.
- [x] AC3 : serveur MCP avec outils en lecture seule ; outils externes enregistrés seulement s'ils sont configurés.
- [x] AC4 : relations avec source, identifiants, date, méthode, confiance, preuve ; `verified` impossible sans méthode vérifiante et preuve.
- [x] AC5 : les six questions métier du brief, plus les risques de release, répondent avec `sources` et `limitations`.
- [x] AC6 : SQLite avec migrations versionnées, déduplication, `stale`, cache TTL, curseur incrémental, mémoire d'exécution des agents.
- [x] AC7 : projet fictif banque / intégrateur / freelances couvrant chaque question.
- [x] AC8 : API HTTP avec CSP, validation, limite de taille, rate limit, repli déterministe.

## 6. Test strategy

| AC            | Test                                                             |
| ------------- | ---------------------------------------------------------------- |
| AC1           | `tests/unit/providers.test.ts`, `tests/live/live.test.ts`        |
| AC2           | `tests/integration/connectors.test.ts`, live GitHub et SonarQube |
| AC3           | `tests/contracts/mcp.test.ts`                                    |
| AC4, AC5, AC7 | `tests/unit/traceability.test.ts`                                |
| AC6           | `tests/integration/store.test.ts`                                |
| AC8           | `tests/integration/api.test.ts`, `tests/e2e/app.spec.ts`         |

## 8. Remaining limitations

- Jira non vérifié en réel (aucune instance).
- Bedrock et Azure non vérifiés en réel (aucun identifiant).
- Pas de synchronisation automatique GitHub → base : les connecteurs sont prêts, l'orchestration de sync live reste à écrire (XDMFS-003).
- Pas d'authentification utilisateur sur l'API.
