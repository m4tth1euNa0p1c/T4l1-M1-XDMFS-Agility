# Intégrations : disponibilité réelle

Statut au 2026-10-27. « Vérifié en réel » signifie qu'un test live a réussi (`docs/evidence/live-tests.txt`).

## GitHub (REST, `src/connectors/github.ts`)

| Fonction         | Endpoint                               | Token                      | Statut                                                      |
| ---------------- | -------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| Pull requests    | `GET /repos/{o}/{r}/pulls`             | optionnel (dépôts publics) | Vérifié en réel                                             |
| Commits d'une PR | `GET /repos/{o}/{r}/pulls/{n}/commits` | optionnel                  | Mocks                                                       |
| Commit           | `GET /repos/{o}/{r}/commits/{ref}`     | optionnel                  | Mocks (le dépôt n'avait pas encore de PR lors du test live) |
| Workflow runs    | `GET /repos/{o}/{r}/actions/runs`      | optionnel                  | Vérifié en réel                                             |
| Déploiements     | `GET /repos/{o}/{r}/deployments`       | optionnel                  | Mocks                                                       |

Limites : rate limit anonyme bas ; un run réussi n'est pas un déploiement.

## Jira (`src/connectors/jira.ts`)

| Édition     | Recherche                    | Auth                      | Statut           |
| ----------- | ---------------------------- | ------------------------- | ---------------- |
| Cloud       | `GET /rest/api/3/search/jql` | email + API token (basic) | Mocks uniquement |
| Data Center | `GET /rest/api/2/search`     | PAT (Bearer)              | Mocks uniquement |

Sprints : API Agile de Jira Software, non implémentée. **Aucune instance Jira n'est configurée : le connecteur n'est pas déclaré opérationnel.**

## SonarQube (`src/connectors/sonarqube.ts`)

| Fonction                  | Endpoint                               | Édition           | Statut                                                |
| ------------------------- | -------------------------------------- | ----------------- | ----------------------------------------------------- |
| Statut serveur            | `GET /api/system/status`               | toutes            | Vérifié en réel (Community Build 26.10, Docker local) |
| Mesures                   | `GET /api/measures/component`          | toutes            | Vérifié en réel                                       |
| Issues                    | `GET /api/issues/search`               | toutes            | Vérifié en réel                                       |
| Quality gate              | `GET /api/qualitygates/project_status` | toutes            | Vérifié en réel                                       |
| Analyse de branches et PR | paramètres `branch`, `pullRequest`     | Developer et plus | Non disponible en Community                           |

## Projet de démonstration

Le projet « Aurore Pay » est fictif (domaines `example.com` / `example.org`). Il suppose une édition SonarQube commerciale pour illustrer les quality gates de PR ; chaque réponse le signale comme donnée de démonstration.
