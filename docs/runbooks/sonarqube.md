# Runbook : SonarQube local (Community Build)

## Démarrer

```bash
docker compose -f docker/docker-compose.sonarqube.yml up -d
curl -s http://127.0.0.1:9000/api/system/status   # attendre "status":"UP"
```

## Première configuration (une seule fois)

1. Changer le mot de passe `admin/admin` (interface http://127.0.0.1:9000 ou `POST /api/users/change_password`).
2. Générer deux jetons (Mon compte > Sécurité) :
   - un jeton utilisateur pour la lecture → `SONARQUBE_TOKEN` ;
   - un jeton d'analyse globale → `SONARQUBE_SCANNER_TOKEN`.
3. Les écrire dans `.env` (ignoré par git) avec `SONARQUBE_URL=http://127.0.0.1:9000`. Ne jamais les afficher.

## Analyser le dépôt

```bash
npx vitest run --coverage      # produit coverage/lcov.info
export SONAR_TOKEN=$(grep '^SONARQUBE_SCANNER_TOKEN=' .env | cut -d= -f2-)
MSYS_NO_PATHCONV=1 docker run --rm -e SONAR_HOST_URL=http://host.docker.internal:9000 -e SONAR_TOKEN \
  -v "$(pwd -W 2>/dev/null || pwd):/usr/src" sonarsource/sonar-scanner-cli
```

La configuration est dans `sonar-project.properties` (clé `xdmfs-agility`).

## Vérifier le connecteur

```bash
npm run test:live    # bloc "live: SonarQube Web API"
```

## Limites

Community Build : analyse de la branche principale uniquement. Les quality gates de PR du projet de démonstration supposent une édition commerciale.
