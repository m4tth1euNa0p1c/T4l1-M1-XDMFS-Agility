/*
 * brain.js - logique pure du chatbot XDMFS Agility (J1-03).
 *
 * Règles :
 *  - aucune manipulation du DOM, aucun accès à window/document ;
 *  - aucune dépendance au temps ou au hasard : même entrée => même sortie ;
 *  - script classique (pas de module ES) pour fonctionner en ouvrant
 *    index.html directement, sans serveur. Les fonctions sont exportées
 *    via module.exports lorsque le fichier est chargé par Node (tests).
 */

/** Limite par défaut, identique au maxlength de #message. */
var LIMITE_PAR_DEFAUT = 200;

/**
 * Met un texte sous une forme comparable : minuscules, sans accents,
 * espaces multiples réduits. "Évolution  du TICKET" -> "evolution du ticket".
 * @param {string} texte
 * @returns {string}
 */
function normaliser(texte) {
  return String(texte)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valide un message saisi par l'utilisateur.
 *
 * La longueur est mesurée sur le texte nettoyé (espaces de début et de fin
 * retirés), en unités UTF-16, comme l'attribut HTML maxlength.
 *
 * @param {unknown} texte - contenu brut du champ
 * @param {number} [limite=200] - nombre maximal de caractères (entier > 0)
 * @returns {{ valide: boolean, texte: string, erreur: string | null }}
 * @throws {RangeError} si la limite n'est pas un entier strictement positif
 */
function validerMessage(texte, limite) {
  if (limite === undefined) {
    limite = LIMITE_PAR_DEFAUT;
  }
  if (typeof limite !== "number" || !Number.isInteger(limite) || limite <= 0) {
    throw new RangeError("La limite doit être un entier strictement positif.");
  }
  if (typeof texte !== "string") {
    return { valide: false, texte: "", erreur: "Le message doit être un texte." };
  }

  var nettoye = texte.trim();
  if (nettoye.length === 0) {
    return { valide: false, texte: "", erreur: "Le message est vide." };
  }
  if (nettoye.length > limite) {
    return {
      valide: false,
      texte: nettoye,
      erreur:
        "Le message dépasse la limite de " +
        limite +
        " caractères (" +
        nettoye.length +
        " saisis).",
    };
  }
  return { valide: true, texte: nettoye, erreur: null };
}

function echapperRegex(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Indique si un mot-clé apparaît comme mot entier (ou expression entière)
 * dans un texte déjà normalisé. "pr" correspond à "ma pr" mais pas à "projet".
 */
function contientMotCle(texteNormalise, motCle) {
  var cle = normaliser(motCle);
  if (cle.length === 0) {
    return false;
  }
  var motif = new RegExp("(^|[^a-z0-9])" + echapperRegex(cle) + "($|[^a-z0-9])");
  return motif.test(texteNormalise);
}

/**
 * Calcule la réponse du bot.
 *
 * Les règles sont évaluées dans l'ordre : la première règle dont un mot-clé
 * apparaît dans le message gagne. La comparaison ignore la casse et les
 * accents. Le jeton {nom} d'une réponse est remplacé par le nom de l'assistant.
 *
 * @param {string} texte - message de l'utilisateur
 * @param {Array<{ motsCles: string[], reponse: string }>} regles
 * @param {{ nom: string, reponseParDefaut: string } | string} assistant
 * @returns {string}
 */
function repondre(texte, regles, assistant) {
  var profil = typeof assistant === "string" ? { nom: assistant } : assistant || {};
  var nom = typeof profil.nom === "string" && profil.nom ? profil.nom : "Assistant";
  var parDefaut =
    typeof profil.reponseParDefaut === "string" && profil.reponseParDefaut
      ? profil.reponseParDefaut
      : "Je n'ai pas compris. Essayez « aide » pour voir ce que je sais faire.";

  var texteNormalise = normaliser(typeof texte === "string" ? texte : "");
  if (texteNormalise.length === 0) {
    return parDefaut.split("{nom}").join(nom);
  }

  var liste = Array.isArray(regles) ? regles : [];
  for (var i = 0; i < liste.length; i++) {
    var regle = liste[i];
    if (!regle || !Array.isArray(regle.motsCles) || typeof regle.reponse !== "string") {
      continue;
    }
    for (var j = 0; j < regle.motsCles.length; j++) {
      if (contientMotCle(texteNormalise, String(regle.motsCles[j]))) {
        return regle.reponse.split("{nom}").join(nom);
      }
    }
  }
  return parDefaut.split("{nom}").join(nom);
}

if (typeof module === "object" && module && module.exports) {
  module.exports = {
    LIMITE_PAR_DEFAUT: LIMITE_PAR_DEFAUT,
    normaliser: normaliser,
    validerMessage: validerMessage,
    repondre: repondre,
  };
}
