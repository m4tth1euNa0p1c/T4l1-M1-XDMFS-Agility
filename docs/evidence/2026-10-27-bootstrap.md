# Rapport de preuve : bootstrap XDMFS Agility

| Champ | Valeur |
|---|---|
| Date | 2026-10-27 |
| Branche | `feature/agentic-factory-bootstrap` |
| Environnement | Windows 11, Node 20.19.5, npm 11.6.4, Docker 28.3.2, Chromium headless (Playwright 1.64) |

## Commandes exécutées

| Commande | Résultat | Sortie |
|---|---|---|
| `npm run check` | exit 0 : lint, prettier, typecheck, 12 fichiers / 181 tests, build | `check.txt` |
| `npm run test:academic` | 4 fichiers / 67 tests réussis | inclus dans `check.txt` |
| `npx playwright test` | 18 tests réussis (9 scénarios × 360 px et 1280 px) | `e2e.txt` |
| `npx vitest run --coverage` | lignes 84,2 %, fonctions 83,2 %, branches 69,4 % | `coverage.txt` |
| `npm audit --omit=dev` | 0 vulnérabilité | `npm-audit.txt` |
| `npm run test:live` (local, `.env`) | 7 tests réussis | `live-tests.txt` |
| `claude plugin validate .claude/agents` / `skills` / `commands` | Validation passed (×3) | sortie console |
| `docker build` puis `docker run` | image 396 Mo, `/api/health` 200, healthcheck `healthy`, utilisateur `node` | sortie console |
| Scanner SonarQube (Docker) sur le dépôt | EXECUTION SUCCESS, quality gate OK | voir ci-dessous |

## Tests live (services réels)
- **Anthropic** : `claude-opus-5-5`, réponse « prêt », en-tête de repli serveur accepté ; streaming (2 fragments) ; boucle d'outils : l'agent a appelé `traceability_issues_blocked_by_quality` et cité PAY-5 et PAY-7 avec sources et limites.
- **GitHub** : lecture des PR et des workflow runs du dépôt du projet (0 et 0 au moment du test, dépôt neuf).
- **SonarQube Community Build 26.10** (Docker local) : statut UP ; projet `xdmfs-agility` : quality gate OK, couverture 75,9 %, 0 bug.

## Constats SonarQube corrigés
Première analyse : 3 constats, tous traités.
| Règle | Fichier | Correction |
|---|---|---|
| typescript:S8786 (regex à backtracking) | `src/assistant/router.ts` | motif simplifié |
| typescript:S8786 | `src/connectors/http.ts` | analyse de l'en-tête Link sans regex |
| typescript:S4790 (SHA-1) | `src/demo/bank-project.ts` | SHA-256 tronqué (identifiants fictifs) |

## Défauts trouvés par les tests pendant le bootstrap
- E2E 360 px : débordement horizontal de 245 px causé par le sélecteur de ticket. Largeur contrainte, test vert.
- Image Docker : `better-sqlite3` sans binaire précompilé pour Node 20.20. Chaîne de compilation ajoutée au seul étage de build.
- Mapping des conditions de quality gate SonarQube : noms de champs corrigés (`metricKey`, `errorThreshold`, `actualValue`), couvert par un test.

## Limitations
- Jira : aucune instance, connecteur testé par mocks uniquement.
- Bedrock et Azure AI Foundry : aucun identifiant, adaptateurs testés par mocks uniquement.
- Workflow GitHub Actions : écrit, son exécution sera visible sur la pull request.
- Serveur MCP : déclaré dans `.mcp.json`, en attente d'approbation dans Claude Code (`claude mcp list`). Le contrat est testé via `InMemoryTransport`.
