# Fournisseurs LLM

| Fournisseur                        | Fichier                          | Streaming | Outils               | Vérifié en réel                                                          |
| ---------------------------------- | -------------------------------- | --------- | -------------------- | ------------------------------------------------------------------------ |
| Anthropic API                      | `src/providers/anthropic.ts`     | oui       | oui                  | oui : génération, streaming, boucle d'outils (`tests/live/live.test.ts`) |
| AWS Bedrock (Converse)             | `src/providers/bedrock.ts`       | non       | selon le modèle      | non, mocks uniquement                                                    |
| Azure AI Foundry (Model Inference) | `src/providers/azure-foundry.ts` | non       | selon le déploiement | non, mocks uniquement                                                    |

## Sélection

`LLM_PROVIDER` = `anthropic` | `bedrock` | `azure-foundry` | `none`. Sans valeur : `anthropic` si `ANTHROPIC_API_KEY` est défini, sinon `none` (mode déterministe).

## Comportements communs

- Requêtes validées par `GenerationRequestSchema` avant tout appel.
- Raisons d'arrêt normalisées : `end`, `max_tokens`, `tool_use`, `refusal`, `other`.
- Erreurs normalisées en `XdmfsError` (`rate_limited`, `timeout`, `quota_exceeded`...), messages passés par `redact()`.
- Consommation agrégée par `UsageMeter`, exposée dans `/api/status`.

## Anthropic

- Modèle par défaut `claude-opus-5-5`, configurable par `ANTHROPIC_MODEL`.
- Retries et timeouts délégués au SDK (2 retries, 120 s).
- Repli serveur sur refus activé par défaut (`fallbacks: "default"`, en-tête bêta `server-side-fallback-2026-07-01`). Désactivable avec `refusalFallback: false`.
- Effort `low` pour l'agent de traçabilité : réponses courtes fondées sur les outils.

## Bedrock et Azure

Le SDK AWS n'est pas une dépendance : injecter un transport (`ConverseCommand`). Pour Claude sur Azure Foundry, utiliser plutôt l'API Messages (`@anthropic-ai/foundry-sdk`) avec `AnthropicProvider`.
