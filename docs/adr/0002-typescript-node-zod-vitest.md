# ADR-0002 : TypeScript, Node 20, zod et Vitest pour la plateforme

- Statut : Accepted
- Date : 2026-10-27

## Contexte

L'interface `LLMProvider` demandée est en TypeScript. Les données externes (API, LLM, MCP) doivent être validées à l'exécution.

## Décision

- TypeScript strict, modules ES (`NodeNext`), Node >= 20.11.
- zod pour tous les contrats d'entrée et les schémas d'outils (MCP et LLM via `z.toJSONSchema`).
- Vitest pour les tests (unitaires, intégration, contrats, académiques), Playwright pour l'E2E.
- Serveur HTTP `node:http` sans framework : surface réduite, en-têtes de sécurité maîtrisés.

## Conséquences

- `npm run check` enchaîne lint, format, typecheck, tests et build.
- TypeScript reste en 5.9 : la 7.x (compilateur natif) n'est pas encore supportée par typescript-eslint dans ce projet.
