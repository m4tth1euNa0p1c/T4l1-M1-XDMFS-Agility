# XDMFS-001 : Chatbot académique J1

| Champ       | Valeur                                              |
| ----------- | --------------------------------------------------- |
| Identifiant | XDMFS-001                                           |
| Statut      | Verified                                            |
| Agents      | academic-compliance-agent, frontend-agent, qa-agent |
| Date        | 2026-10-27                                          |

## 1. Requirement

Consignes J1-01 à J1-04 transmises par le porteur du projet (documents officiels absents, voir `docs/academic/contract-assumptions.md`).

## 2. Scope

- Inclus : `public/index.html`, `public/css/style.css`, `public/js/brain.js`, `public/js/app.js`, `public/js/regles.js`, `NOTES.md`.
- Exclus : tout appel serveur ou IA.

## 3. Acceptance criteria

- [x] AC1 : ids et attributs du contrat présents, sans doublon.
- [x] AC2 : `validerMessage` gère vide, limite exacte, limite + 1, types invalides, limite invalide.
- [x] AC3 : `repondre` déterministe, insensible à la casse et aux accents, mots entiers, priorité par ordre.
- [x] AC4 : `brain.js` sans DOM, sans temps, sans hasard.
- [x] AC5 : envoi au clic et à Entrée, `li.msg` + `data-role`, `#statut`, `#compteur`, `#effacer`.
- [x] AC6 : contraste ≥ 4,5:1 en clair et en sombre, focus visible, mots de 200 caractères sans débordement à 360 px.
- [x] AC7 : aucune injection HTML depuis la saisie.
- [x] AC8 : fonctionne sans serveur (scripts classiques).

## 6. Test strategy

| AC       | Test                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| AC1      | `tests/academic/html-contract.test.ts`                                        |
| AC2-AC4  | `tests/academic/brain.test.ts`                                                |
| AC5, AC7 | `tests/academic/app.test.ts` (jsdom), `tests/e2e/app.spec.ts`                 |
| AC6      | `tests/academic/css.test.ts`, E2E 360 px                                      |
| AC8      | chargement jsdom des scripts tels que déclarés, test E2E sans requête externe |

## 7. Evidence

`docs/evidence/2026-10-27-bootstrap.md`.

## 8. Remaining limitations

Hypothèses de format (retour de `validerMessage`, emplacement des fichiers) à confirmer avec `CONTRAT.md`.
