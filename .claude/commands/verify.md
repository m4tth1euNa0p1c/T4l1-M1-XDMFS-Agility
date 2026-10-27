---
description: Exécute la validation complète (lint, format, types, tests, build, E2E) et résume les résultats
---

Exécute dans l'ordre et arrête-toi au premier échec :

1. `npm run check`
2. `npm run test:e2e`

Puis résume : commande, ligne de résumé exacte, échecs avec leur sortie. Ne déclare rien comme réussi sans l'avoir exécuté. Si le périmètre touche `public/`, applique aussi la skill `academic-contract-validation`.
