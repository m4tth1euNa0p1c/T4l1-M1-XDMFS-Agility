# ADR-0001 : Séparer le chatbot académique et la plateforme

- Statut : Accepted
- Date : 2026-10-27

## Contexte

Le correcteur automatique EFREI évalue un chatbot HTML/CSS/JS (J1-01 à J1-04) qui doit fonctionner sans serveur d'IA. Le projet XDMFS ajoute des intégrations, un LLM et une base de données. Un couplage ferait dépendre la note de services externes.

## Options

1. Une seule application : le chatbot appelle l'API. Simple, mais casse le fonctionnement hors ligne.
2. Deux modules : `public/` (scripts navigateur classiques, aucun import de `src/`) et `src/` (Node/TypeScript).

## Décision

Option 2. `public/index.html` fonctionne en ouvrant le fichier directement. Le tableau de traçabilité (`public/tracabilite/`) est une page séparée qui appelle l'API.

## Conséquences

- Le contrat académique est testé isolément (`tests/academic/`).
- `public/js/*.js` sont des scripts classiques (pas de modules ES) pour fonctionner en `file://` ; `public/js/package.json` les déclare CommonJS pour les tests Node.
