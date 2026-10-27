# Évaluation de sécurité : <périmètre>

| Champ  | Valeur |
| ------ | ------ |
| Date   |        |
| Commit |        |

## Surface analysée

## Contrôles

| Contrôle                                        | Résultat | Preuve |
| ----------------------------------------------- | -------- | ------ |
| Secrets absents du code et de l'historique      |          |        |
| `.env` ignoré par git                           |          |        |
| Validation des entrées (zod)                    |          |        |
| Traversée de chemin bloquée                     |          |        |
| Limite de taille et rate limit                  |          |        |
| Connecteurs en lecture seule, https             |          |        |
| Rendu sans innerHTML, CSP stricte               |          |        |
| Outils LLM sans mutation                        |          |        |
| Actions GitHub épinglées, permissions minimales |          |        |
| `npm audit --omit=dev`                          |          |        |

## Constats

| Gravité | Description | Recommandation | Statut |
| ------- | ----------- | -------------- | ------ |

## Risques acceptés
