# Runbook : exploitation

## Image de production

```bash
docker build -t xdmfs-agility .
docker run -d --name xdmfs -p 127.0.0.1:3000:3000 -v xdmfs-data:/data \
  --env-file .env -e HOST=0.0.0.0 xdmfs-agility
curl -s http://127.0.0.1:3000/api/health
```

- Utilisateur non root (`node`), base SQLite dans le volume `/data`, `HEALTHCHECK` sur `/api/health`.
- Arrêt propre sur SIGTERM (fermeture du serveur puis de la base).

## Sans Docker

```bash
npm ci && npm run build && npm start
```

## Surveillance

- `GET /api/health` : état et uptime.
- `GET /api/status` : fournisseur LLM, connecteurs configurés (noms seulement), consommation de tokens.
- Journaux JSON sur stdout, un par requête API, valeurs secrètes masquées par `redact()`.

## Limites connues avant une vraie mise en production

- Pas d'authentification utilisateur : à placer derrière un reverse proxy authentifié (SSO de l'entreprise).
- Rate limiter et base locaux : une seule instance.
- TLS à terminer sur le reverse proxy.
- Aucune destination de déploiement n'est configurée dans la CI : le déploiement reste manuel.

## Serveur MCP

Déclaré dans `.mcp.json` pour Claude Code (`npx tsx src/mcp/server.ts`, transport stdio). Vérifier avec `claude mcp list`.
