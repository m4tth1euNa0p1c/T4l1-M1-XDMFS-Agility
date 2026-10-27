# Connecteur MCP : <système>

| Champ            | Valeur                                      |
| ---------------- | ------------------------------------------- |
| Système          | GitHub / Jira / SonarQube / autre           |
| Édition(s)       | Cloud, Data Center, Community, Developer... |
| API officielle   | URL de la documentation                     |
| Authentification | type, portée minimale                       |
| Mode             | Lecture seule (obligatoire par défaut)      |

## Outils exposés

| Outil MCP | Endpoint REST | Paramètres | Permissions | Disponibilité par édition |
| --------- | ------------- | ---------- | ----------- | ------------------------- |

## Disponibilité

- Disponible :
- Sous licence :
- Nécessite un token :
- Nécessite une instance serveur :
- Non disponible :

## Erreurs

| HTTP | Code normalisé                   | Retry                |
| ---- | -------------------------------- | -------------------- |
| 401  | authentication                   | non                  |
| 403  | permission_denied / rate_limited | selon en-têtes       |
| 404  | not_found                        | non                  |
| 429  | rate_limited                     | oui (retry-after)    |
| 5xx  | unavailable / upstream_error     | oui pour 502/503/504 |

## Tests

- Mocks : `tests/integration/connectors.test.ts`
- Contrat MCP : `tests/contracts/mcp.test.ts`
- Live : `tests/live/live.test.ts` (si identifiants disponibles)
