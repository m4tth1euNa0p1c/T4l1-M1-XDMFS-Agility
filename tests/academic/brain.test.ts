import { describe, expect, it } from "vitest";
import { loadBrain, loadRegles, readPublic } from "../helpers/academic.js";

const { validerMessage, repondre, normaliser, LIMITE_PAR_DEFAUT } = loadBrain();
const { REGLES, ASSISTANT } = loadRegles();

describe("J1-03 validerMessage(texte, limite)", () => {
  it("accepte un message normal et retire les espaces de bord", () => {
    expect(validerMessage("  bonjour  ", 200)).toEqual({
      valide: true,
      texte: "bonjour",
      erreur: null,
    });
  });

  it("refuse un message vide ou composé d'espaces", () => {
    expect(validerMessage("", 200).valide).toBe(false);
    expect(validerMessage("   \n\t ", 200)).toMatchObject({
      valide: false,
      erreur: "Le message est vide.",
    });
  });

  it("accepte exactement la limite et refuse limite + 1", () => {
    expect(validerMessage("a".repeat(200), 200).valide).toBe(true);
    const trop = validerMessage("a".repeat(201), 200);
    expect(trop.valide).toBe(false);
    expect(trop.erreur).toContain("200");
  });

  it("mesure la longueur après nettoyage des espaces de bord", () => {
    expect(validerMessage(`  ${"a".repeat(10)}  `, 10).valide).toBe(true);
  });

  it("respecte une limite personnalisée", () => {
    expect(validerMessage("abcdef", 5).valide).toBe(false);
    expect(validerMessage("abcde", 5).valide).toBe(true);
  });

  it("utilise la limite par défaut (200) si elle est omise", () => {
    expect(LIMITE_PAR_DEFAUT).toBe(200);
    expect(validerMessage("a".repeat(200)).valide).toBe(true);
    expect(validerMessage("a".repeat(201)).valide).toBe(false);
  });

  it("refuse une entrée qui n'est pas une chaîne", () => {
    for (const valeur of [null, undefined, 42, {}, []]) {
      expect(validerMessage(valeur, 200).valide).toBe(false);
    }
  });

  it("lève une RangeError pour une limite invalide", () => {
    for (const limite of [0, -1, 1.5, Number.NaN, "200", null]) {
      expect(() => validerMessage("ok", limite)).toThrow(RangeError);
    }
  });
});

describe("J1-03 repondre(texte, regles, assistant)", () => {
  it("répond selon la première règle correspondante", () => {
    expect(repondre("bonjour", REGLES, ASSISTANT)).toContain("Agilo");
  });

  it("ignore la casse et les accents (bonus)", () => {
    const attendu = repondre("qualite", REGLES, ASSISTANT);
    expect(repondre("QUALITÉ", REGLES, ASSISTANT)).toBe(attendu);
    expect(repondre("Qualité du code ?", REGLES, ASSISTANT)).toBe(attendu);
  });

  it("compare des mots entiers : 'pr' ne correspond pas à 'projet'", () => {
    const regles = [{ motsCles: ["pr"], reponse: "PR" }];
    expect(repondre("ma PR est prête", regles, ASSISTANT)).toBe("PR");
    expect(repondre("mon projet", regles, ASSISTANT)).toBe(ASSISTANT.reponseParDefaut);
  });

  it("respecte l'ordre des règles comme priorité", () => {
    const regles = [
      { motsCles: ["ticket"], reponse: "A" },
      { motsCles: ["ticket"], reponse: "B" },
    ];
    expect(repondre("ticket", regles, ASSISTANT)).toBe("A");
  });

  it("renvoie la réponse par défaut si aucune règle ne correspond", () => {
    expect(repondre("xyzzy", REGLES, ASSISTANT)).toBe(ASSISTANT.reponseParDefaut);
  });

  it("remplace {nom} et accepte un assistant donné par son nom", () => {
    const regles = [{ motsCles: ["qui"], reponse: "Je suis {nom}." }];
    expect(repondre("qui es-tu", regles, "Robo")).toBe("Je suis Robo.");
  });

  it("reste robuste face à des règles invalides", () => {
    expect(repondre("bonjour", null, ASSISTANT)).toBe(ASSISTANT.reponseParDefaut);
    expect(repondre("bonjour", [null, { motsCles: "x" }], ASSISTANT)).toBe(
      ASSISTANT.reponseParDefaut,
    );
    expect(typeof repondre("bonjour", REGLES, undefined)).toBe("string");
  });

  it("est déterministe : 100 appels donnent la même réponse", () => {
    const premiere = repondre("Quels tickets sont liés à cette PR ?", REGLES, ASSISTANT);
    for (let i = 0; i < 100; i++) {
      expect(repondre("Quels tickets sont liés à cette PR ?", REGLES, ASSISTANT)).toBe(premiere);
    }
  });

  it("traite les caractères spéciaux des mots-clés sans erreur de regex", () => {
    const regles = [{ motsCles: ["c++"], reponse: "cpp" }];
    expect(repondre("j'aime le c++ !", regles, ASSISTANT)).toBe("cpp");
  });
});

describe("normaliser", () => {
  it("supprime accents, casse et espaces multiples", () => {
    expect(normaliser("  Évolution   du TICKET ")).toBe("evolution du ticket");
  });
});

describe("brain.js reste une logique pure", () => {
  const source = readPublic("js/brain.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("n'utilise ni document, ni window, ni API du navigateur", () => {
    expect(source).not.toMatch(/\b(document|window|localStorage|alert|fetch|addEventListener)\b/);
  });

  it("ne dépend ni du hasard ni de l'heure", () => {
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date/);
  });
});
