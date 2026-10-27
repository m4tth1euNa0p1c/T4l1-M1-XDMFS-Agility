import { beforeEach, describe, expect, it } from "vitest";
import type { JSDOM } from "jsdom";
import { loadPage } from "../helpers/academic.js";

let dom: JSDOM;
let doc: Document;
let champ: HTMLInputElement;

function saisir(texte: string) {
  champ.value = texte;
  champ.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}
function cliquerEnvoyer() {
  doc.querySelector<HTMLButtonElement>("#envoyer")!.click();
}
function messages() {
  return [...doc.querySelectorAll<HTMLLIElement>("#historique > li")];
}
function appuyerEntree(shiftKey = false) {
  champ.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

beforeEach(() => {
  dom = loadPage();
  doc = dom.window.document;
  champ = doc.querySelector<HTMLInputElement>("#message")!;
});

describe("J1-04 app.js", () => {
  it("envoie au clic : un li.msg user puis un li.msg bot", () => {
    saisir("bonjour");
    cliquerEnvoyer();
    const lis = messages();
    expect(lis).toHaveLength(2);
    expect(lis.every((li) => li.classList.contains("msg"))).toBe(true);
    expect(lis[0]!.dataset.role).toBe("user");
    expect(lis[0]!.textContent).toBe("bonjour");
    expect(lis[1]!.dataset.role).toBe("bot");
    expect(lis[1]!.textContent).toContain("Agilo");
  });

  it("envoie avec la touche Entrée", () => {
    saisir("aide");
    appuyerEntree();
    expect(messages()).toHaveLength(2);
  });

  it("n'envoie pas avec Maj+Entrée", () => {
    saisir("aide");
    appuyerEntree(true);
    expect(messages()).toHaveLength(0);
  });

  it("vide le champ et remet le compteur à zéro après envoi", () => {
    saisir("merci");
    expect(doc.querySelector("#compteur")!.textContent).toBe("5 / 200");
    cliquerEnvoyer();
    expect(champ.value).toBe("");
    expect(doc.querySelector("#compteur")!.textContent).toBe("0 / 200");
  });

  it("refuse un message vide et l'annonce dans #statut", () => {
    saisir("   ");
    cliquerEnvoyer();
    expect(messages()).toHaveLength(0);
    const statut = doc.querySelector("#statut")!;
    expect(statut.textContent).toBe("Le message est vide.");
    expect(statut.classList.contains("erreur")).toBe(true);
    expect(champ.getAttribute("aria-invalid")).toBe("true");
  });

  it("refuse un message trop long injecté sans passer par maxlength", () => {
    champ.value = "a".repeat(201);
    cliquerEnvoyer();
    expect(messages()).toHaveLength(0);
    expect(doc.querySelector("#statut")!.textContent).toContain("200");
  });

  it("annonce la réponse dans #statut", () => {
    saisir("bonjour");
    cliquerEnvoyer();
    expect(doc.querySelector("#statut")!.textContent).toBe("Réponse reçue de Agilo.");
  });

  it("n'interprète pas le HTML saisi (pas d'injection)", () => {
    const charge = '<img src=x onerror="alert(1)">';
    saisir(charge);
    cliquerEnvoyer();
    expect(messages()[0]!.querySelector("img")).toBeNull();
    expect(messages()[0]!.textContent).toBe(charge);
  });

  it("affiche un mot de 200 caractères tel quel", () => {
    saisir("x".repeat(200));
    cliquerEnvoyer();
    expect(messages()[0]!.textContent).toHaveLength(200);
  });

  it("#effacer vide l'historique (bonus)", () => {
    saisir("bonjour");
    cliquerEnvoyer();
    doc.querySelector<HTMLButtonElement>("#effacer")!.click();
    expect(messages()).toHaveLength(0);
    expect(doc.querySelector("#statut")!.textContent).toBe("Conversation effacée.");
  });

  it("conserve l'ordre des échanges", () => {
    for (const texte of ["bonjour", "jira", "merci"]) {
      saisir(texte);
      cliquerEnvoyer();
    }
    expect(messages().map((li) => li.dataset.role)).toEqual([
      "user",
      "bot",
      "user",
      "bot",
      "user",
      "bot",
    ]);
  });
});
