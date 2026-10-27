# ADR-0006 : Abstraction multi-fournisseur LLM, Anthropic en premier

- Statut : Accepted
- Date : 2026-10-27

## Contexte

Fournisseurs cibles : Anthropic API, AWS Bedrock, Azure AI Foundry. Leurs capacités (streaming, tool calling, quotas, schémas d'outils) diffèrent.

## Décision

- Interface `LLMProvider` (`generate`, `stream?`, `capabilities`) et contrats zod dans `src/providers/types.ts`.
- Adaptateurs spécifiques, transport injecté pour les tests :
  - `AnthropicProvider` : SDK officiel `@anthropic-ai/sdk`, modèle par défaut `claude-opus-5-5`, retries délégués au SDK, erreurs typées normalisées, repli serveur sur refus (`fallbacks: "default"`, bêta `server-side-fallback-2026-07-01`) activé par défaut et désactivable.
  - `BedrockProvider` : formes de l'API Converse, transport AWS injecté (SDK AWS non embarqué).
  - `AzureFoundryProvider` : endpoint chat-completions de Model Inference via `fetch`.
- `capabilities().verifiedAgainstRealService` vaut `true` seulement après un test live réussi.
- Sans fournisseur, l'application reste entièrement fonctionnelle en mode déterministe.

## Conséquences

- Anthropic est vérifié en réel (`docs/evidence/live-tests.txt`). Bedrock et Azure ne le sont pas : aucun identifiant disponible.
