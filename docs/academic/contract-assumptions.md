# Contrat académique J1 : hypothèses

`CONTRAT.md`, `VARIANTE.md` et `J1-apres-midi_md.pdf` **ne sont pas présents** dans le dépôt ni dans l'espace de travail au 2026-10-27. Le contrat ci-dessous reprend la consigne transmise par le porteur du projet. Dès que les documents officiels sont ajoutés, ils priment et les tests `tests/academic/` doivent être alignés.

## Éléments imposés (tels que transmis)

| Exigence                                                                                                      | Implémentation         | Test                    |
| ------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------- |
| `main`, `h1`                                                                                                  | `public/index.html`    | `html-contract.test.ts` |
| `ul#historique` avec `aria-live`                                                                              | `aria-live="polite"`   | idem                    |
| `form#formulaire`, `#message` `required` + `maxlength`, `#envoyer`                                            | `maxlength="200"`      | idem                    |
| Lien d'évitement vers `#contenu` (bonus)                                                                      | `main#contenu`         | idem, E2E clavier       |
| `style.css` responsive 360-1280, contraste 4,5:1, focus visible, mots de 200 caractères, thème sombre (bonus) | `public/css/style.css` | `css.test.ts`, E2E      |
| `validerMessage(texte, limite)`, `repondre(texte, regles, assistant)` purs                                    | `public/js/brain.js`   | `brain.test.ts`         |
| Envoi clic et Entrée, `li.msg`, `data-role`, `#statut`, `#compteur`, `#effacer` (bonus)                       | `public/js/app.js`     | `app.test.ts`, E2E      |

## Hypothèses à confirmer avec `CONTRAT.md`

1. **Emplacement** : `brain.js` et `app.js` sont dans `public/js/`.
2. **Retour de `validerMessage`** : objet `{ valide, texte, erreur }`. Le texte est nettoyé des espaces de bord ; la longueur est comptée après nettoyage, en unités UTF-16 comme `maxlength`. Limite par défaut 200. Une limite non entière ou ≤ 0 lève une `RangeError`.
3. **Format des règles** : `[{ motsCles: string[], reponse: string }]`, évaluées dans l'ordre, première correspondance gagnante, mots entiers, sans casse ni accents.
4. **`assistant`** : objet `{ nom, reponseParDefaut }` ou simple chaîne (nom). `{nom}` dans une réponse est remplacé.
5. **Thème du bot** (probablement défini par `VARIANTE.md`) : traçabilité Agile, assistant « Agilo ».
6. **Chargement** : scripts classiques, pas de modules ES, pour fonctionner en `file://`.
