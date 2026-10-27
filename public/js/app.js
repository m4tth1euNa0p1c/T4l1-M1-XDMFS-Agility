/*
 * app.js - interface du chatbot (J1-04).
 *
 * Seul fichier qui touche au DOM. Il lit la saisie, délègue la validation
 * et la réponse à brain.js (validerMessage, repondre), puis affiche le
 * résultat. Aucun serveur ni API d'IA n'est nécessaire.
 *
 * Dépend des scripts chargés avant lui : regles.js (REGLES, ASSISTANT)
 * et brain.js (validerMessage, repondre).
 */
/* global validerMessage, repondre, REGLES, ASSISTANT */
(function () {
  "use strict";

  var historique = document.getElementById("historique");
  var formulaire = document.getElementById("formulaire");
  var champ = document.getElementById("message");
  var compteur = document.getElementById("compteur");
  var statut = document.getElementById("statut");
  var boutonEffacer = document.getElementById("effacer");

  if (!historique || !formulaire || !champ || !compteur || !statut) {
    return;
  }

  var limite = champ.maxLength > 0 ? champ.maxLength : 200;

  function definirStatut(texte, estErreur) {
    statut.textContent = texte;
    statut.classList.toggle("erreur", Boolean(estErreur));
  }

  function mettreAJourCompteur() {
    var longueur = champ.value.length;
    compteur.textContent = longueur + " / " + limite;
    compteur.classList.toggle("proche-limite", longueur >= limite * 0.9);
  }

  /**
   * Ajoute un message à l'historique. textContent (jamais innerHTML)
   * empêche toute injection HTML depuis la saisie.
   */
  function ajouterMessage(role, texte) {
    var element = document.createElement("li");
    element.className = "msg";
    element.setAttribute("data-role", role);
    element.textContent = texte;
    historique.appendChild(element);
    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "end" });
    }
    return element;
  }

  function envoyer() {
    var resultat = validerMessage(champ.value, limite);
    if (!resultat.valide) {
      champ.setAttribute("aria-invalid", "true");
      definirStatut(resultat.erreur, true);
      champ.focus();
      return;
    }

    champ.removeAttribute("aria-invalid");
    ajouterMessage("user", resultat.texte);
    ajouterMessage("bot", repondre(resultat.texte, REGLES, ASSISTANT));

    champ.value = "";
    mettreAJourCompteur();
    definirStatut("Réponse reçue de " + ASSISTANT.nom + ".", false);
    champ.focus();
  }

  formulaire.addEventListener("submit", function (evenement) {
    evenement.preventDefault();
    envoyer();
  });

  // Entrée envoie le message. On bloque la soumission implicite du
  // formulaire pour n'avoir qu'un seul chemin d'envoi.
  champ.addEventListener("keydown", function (evenement) {
    if (evenement.key === "Enter" && !evenement.shiftKey && !evenement.isComposing) {
      evenement.preventDefault();
      envoyer();
    }
  });

  champ.addEventListener("input", function () {
    mettreAJourCompteur();
    if (champ.getAttribute("aria-invalid") === "true" && champ.value.trim() !== "") {
      champ.removeAttribute("aria-invalid");
      definirStatut("", false);
    }
  });

  if (boutonEffacer) {
    boutonEffacer.addEventListener("click", function () {
      while (historique.firstChild) {
        historique.removeChild(historique.firstChild);
      }
      definirStatut("Conversation effacée.", false);
      champ.focus();
    });
  }

  mettreAJourCompteur();
})();
