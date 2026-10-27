# Plan de test : <périmètre>

| Champ         | Valeur    |
| ------------- | --------- |
| Spécification | XDMFS-NNN |
| Date          |           |

## Objectifs

## Environnements

- Local (Node 20, Windows / Linux), CI GitHub Actions, navigateurs (Chromium 360 et 1280 px).

## Matrice

| Niveau      | Commande                   | Couvre         | Attendu          |
| ----------- | -------------------------- | -------------- | ---------------- |
| Académique  | `npm run test:academic`    | contrat J1     | 100 % pass       |
| Unitaire    | `npm run test:unit`        |                |                  |
| Intégration | `npm run test:integration` |                |                  |
| Contrats    | `npm run test:contracts`   |                |                  |
| E2E         | `npm run test:e2e`         |                |                  |
| Live        | `npm run test:live`        | services réels | local uniquement |

## Données de test

## Risques et exclusions
