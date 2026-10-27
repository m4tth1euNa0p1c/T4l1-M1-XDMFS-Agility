# NOTES : chatbot J1

## 1. Pourquoi `brain.js` ne manipule-t-il pas le DOM ?

`brain.js` contient uniquement la logique : décider si un message est valide (`validerMessage`) et choisir la réponse (`repondre`). Il ne lit ni n'écrit la page. Trois raisons :

- **Testabilité.** Une fonction pure se teste sans navigateur : on lui donne une entrée, on vérifie la sortie. `tests/academic/brain.test.ts` charge `brain.js` directement dans Node, sans page HTML.
- **Déterminisme.** Sans DOM, sans `Date` ni `Math.random`, la même question donne toujours la même réponse. Un test vérifie 100 appels identiques.
- **Séparation des rôles.** Si l'interface change (autre page, autre framework, tableau de bord), `brain.js` reste identique. Seul `app.js` connaît les ids `#historique`, `#message`, etc.

Un test vérifie que `brain.js` ne contient pas `document`, `window`, `fetch` ni `addEventListener`.

## 2. Cheminement complet d'un message

1. L'utilisateur tape dans `#message`. À chaque frappe, l'événement `input` met à jour `#compteur` (« 7 / 200 »). L'attribut `maxlength="200"` empêche de dépasser la limite au clavier.
2. Il clique sur `#envoyer` (événement `submit` du formulaire) ou appuie sur Entrée (événement `keydown`). Dans les deux cas, `app.js` appelle `preventDefault()` pour ne pas recharger la page, puis la même fonction `envoyer()`.
3. `envoyer()` appelle `validerMessage(champ.value, 200)` de `brain.js`. Le texte est nettoyé des espaces de bord puis contrôlé : vide → erreur, plus de 200 caractères → erreur.
4. Si le message est invalide : le message d'erreur s'affiche dans `#statut` (zone `role="status"`, lue par les lecteurs d'écran), le champ reçoit `aria-invalid="true"` et garde le focus. Rien n'est ajouté à l'historique.
5. Si le message est valide : `app.js` crée un `li.msg` avec `data-role="user"` et y place le texte avec `textContent` (le HTML éventuel est affiché comme du texte, pas exécuté).
6. `app.js` appelle `repondre(texte, REGLES, ASSISTANT)`. `brain.js` normalise le texte (minuscules, sans accents), parcourt les règles de `regles.js` dans l'ordre et renvoie la réponse de la première règle dont un mot-clé apparaît comme mot entier, sinon la réponse par défaut.
7. `app.js` ajoute un second `li.msg` avec `data-role="bot"`. Comme `ul#historique` a `aria-live="polite"`, le lecteur d'écran annonce la réponse.
8. Le champ est vidé, le compteur revient à « 0 / 200 », `#statut` indique « Réponse reçue de Agilo. » et le focus revient dans le champ pour le message suivant.

`#effacer` vide l'historique et l'annonce dans `#statut`.

## 3. Quel test a été utile et pourquoi ?

Le test **« compare des mots entiers : 'pr' ne correspond pas à 'projet' »** (`tests/academic/brain.test.ts`) est le plus utile. Une recherche par simple inclusion de chaîne (`texte.includes(motCle)`) semble suffire, mais avec le mot-clé « pr » (pull request), la question « mon projet » déclencherait la réponse sur les pull requests, car « projet » contient « pr ». Ce test fixe le comportement attendu : une recherche par mot entier, avec une expression régulière bornée par des caractères non alphanumériques. Si quelqu'un simplifie un jour `contientMotCle` avec `includes`, le test échoue immédiatement. Le test voisin « c++ » vérifie que les caractères spéciaux des mots-clés sont échappés ; sans cela, une règle contenant `+` casserait l'expression régulière.

Résultat observé lors de la dernière exécution (`npm run test:academic`) : 4 fichiers, 67 tests réussis.

## Préparation de l'oral (J4)

- **En une phrase :** un chatbot sans serveur où `brain.js` décide et `app.js` affiche.
- **Démonstration :** ouvrir `public/index.html` en double-cliquant (pas de serveur), envoyer « bonjour », puis un message vide, puis un mot de 200 caractères, puis naviguer au clavier (Tab → lien d'évitement).
- **Accessibilité :** `aria-live` sur l'historique, `role="status"` pour les erreurs, focus visible, contraste vérifié par un test qui calcule les ratios WCAG depuis les variables CSS.
- **Sécurité :** `textContent` au lieu de `innerHTML`, testé avec une balise `<img onerror>`.
- **Question probable « pourquoi pas de modules ES ? » :** les modules ne se chargent pas depuis `file://` à cause de la politique d'origine ; des scripts classiques garantissent que le chatbot marche sans serveur.
- **Extension :** la même logique de séparation est appliquée au tableau de traçabilité (`/tracabilite/`), qui interroge une API et peut s'appuyer sur Claude.
