# ADR-0004 : SQLite derrière une interface de stockage remplaçable

- Statut : Accepted
- Date : 2026-10-27

## Contexte

Le prototype doit persister la mémoire de traçabilité et d'exécution des agents, sans infrastructure lourde.

## Options

1. SQLite (better-sqlite3), fichier local.
2. Base vectorielle ou graphe externe : aucun besoin démontré à ce stade.

## Décision

SQLite via `SqliteTraceStore`, derrière l'interface `TraceStore`. Migrations versionnées et append-only (`src/memory/migrations.ts`), déduplication par identifiant stable, entités non revues marquées `stale`, cache avec TTL, curseur de synchronisation incrémentale.

## Conséquences

- Une instance unique : le rate limiter et la base sont locaux. Un déploiement multi-instance demandera une base partagée.
- La mémoire projet (ADR, specs) reste versionnée dans le dépôt, pas en base.
