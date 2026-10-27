# ADR-0003 : Modèle de preuve verified / inferred / unknown

- Statut : Accepted
- Date : 2026-10-27

## Contexte

Les liens ticket → code sont presque toujours déduits de conventions (clé Jira dans une branche ou un message). Les présenter comme des faits fausserait les réponses d'audit.

## Décision

- Chaque relation porte : source, identifiant de l'objet source, date d'observation, méthode de corrélation, confiance, preuve.
- `verified` uniquement pour les méthodes listées dans `VERIFYING_METHODS` (lien explicite d'API, head SHA de CI, révision SonarQube, SHA de déploiement, ascendance Git), avec preuve et confiance 1.
- `inferred` pour les conventions, confiance < 1, jamais promue.
- Un chemin prend le statut de son lien le plus faible.
- Contraintes doublées en base (CHECK SQLite) et dans `RelationSchema`.

## Conséquences

- Toute réponse expose `sources` et `limitations`.
- Un workflow réussi n'est jamais compté comme un déploiement ; une quality gate n'est jamais une validation fonctionnelle.
