/*
 * regles.js - données du chatbot (profil de l'assistant et règles).
 *
 * Fichier de données uniquement : aucune logique, aucun accès au DOM.
 * L'ordre des règles est une priorité : la première règle qui correspond gagne.
 * Les mots-clés sont comparés sans casse ni accents par brain.js.
 *
 * Mode J1 : réponses statiques. Le bot n'interroge ni Jira, ni GitHub,
 * ni SonarQube ; il explique ce que la plateforme XDMFS permettra.
 */

var ASSISTANT = {
  nom: "Agilo",
  reponseParDefaut:
    "Je n'ai pas compris votre demande. Tapez « aide » pour voir les sujets que je connais.",
};

var REGLES = [
  {
    motsCles: ["bonjour", "salut", "hello", "bonsoir", "coucou"],
    reponse:
      "Bonjour, je suis {nom}, l'assistant de traçabilité XDMFS Agility. Tapez « aide » pour commencer.",
  },
  {
    motsCles: ["aide", "help", "que sais-tu faire", "commandes"],
    reponse:
      "Je peux vous expliquer : les tickets Jira, les commits, les pull requests, la qualité SonarQube, la traçabilité et les déploiements.",
  },
  {
    motsCles: ["pull request", "pull requests", "pr", "merge request"],
    reponse:
      "Une pull request regroupe des commits à relire. Je la relie aux tickets Jira cités dans son titre, sa branche ou ses commits.",
  },
  {
    motsCles: ["jira", "ticket", "tickets", "issue", "user story", "story"],
    reponse:
      "Un ticket Jira porte une clé comme ABC-123. Citez cette clé dans le nom de branche et les messages de commit pour qu'il soit traçable.",
  },
  {
    motsCles: ["commit", "commits", "branche", "git"],
    reponse:
      "Un commit est relié à un ticket quand son message cite la clé Jira. Sans clé, le lien reste au mieux déduit, jamais vérifié.",
  },
  {
    motsCles: ["sonarqube", "sonar", "qualite", "quality gate", "dette technique"],
    reponse:
      "SonarQube mesure la qualité du code. Une quality gate réussie ne prouve pas que la fonctionnalité marche : elle complète les tests.",
  },
  {
    motsCles: ["tracabilite", "traceabilite", "lien", "liens", "chaine"],
    reponse:
      "La chaîne de traçabilité va du ticket à la branche, au commit, à la pull request, à la CI, à l'analyse SonarQube puis au déploiement.",
  },
  {
    motsCles: ["deploiement", "deployer", "deploy", "production", "release"],
    reponse:
      "Un workflow CI réussi n'est pas un déploiement. Seul un enregistrement de déploiement confirme qu'un changement est livré.",
  },
  {
    motsCles: ["merci", "thanks", "super", "parfait"],
    reponse: "Avec plaisir. Autre chose sur la traçabilité de votre projet ?",
  },
  {
    motsCles: ["au revoir", "bye", "a bientot", "ciao"],
    reponse: "Au revoir, et bonne livraison !",
  },
];

if (typeof module === "object" && module && module.exports) {
  module.exports = { ASSISTANT: ASSISTANT, REGLES: REGLES };
}
