# Runbook : démonstration (projet bancaire fictif « Aurore Pay »)

## Lancer

```bash
npm ci
npm run dev                       # http://127.0.0.1:3000
```

- Chatbot J1 : http://127.0.0.1:3000/ (fonctionne aussi en ouvrant `public/index.html`).
- Tableau de traçabilité : http://127.0.0.1:3000/tracabilite/

Sans `ANTHROPIC_API_KEY`, l'assistant répond en mode déterministe. Avec la clé, il interroge Claude, qui appelle les outils de traçabilité.

## Le scénario

Banque Aurore (client) confie le virement instantané SEPA à Nexalis Intégration (intégrateur) et à deux freelances (front-end, sécurité API). Cinq sprints, du 31/08 au 06/11/2026. Tout est fictif.

| Question à poser                               | Ce que la démo montre                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| « Quels tickets sont liés à la PR #13 ? »      | PAY-7, lien déduit par titre, branche et commits                         |
| « Quels tickets sont liés à la PR #11 ? »      | PAY-16, déduit uniquement par le nom de branche                          |
| « Quels changements n'ont pas de ticket ? »    | PR #15, commit de dépendances arrivé en production                       |
| « Quelles PR n'ont pas de contrôle qualité ? » | #5 et #13 (quality gate en échec), #9 (pas d'analyse), #15 (CI en échec) |
| « Quels tickets sont bloqués par SonarQube ? » | PAY-5 (fusionnée malgré l'échec), PAY-7                                  |
| « Qu'est-ce qui est en production ? »          | Déploiement #708 du 19/10, après l'échec du #707                         |
| « Chaîne de PAY-6 »                            | Livraison partielle : la PR #12 n'est qu'en staging                      |
| « Chaîne de PAY-18 »                           | Terminé dans Jira sans aucun commit                                      |
| « Quelles informations manquent ? »            | Ticket PAY-99 cité mais non synchronisé                                  |
| « Risques de release »                         | Synthèse classée par gravité                                             |

## Réinitialiser

Supprimer `data/xdmfs.sqlite*` : le projet est recréé au prochain démarrage.
