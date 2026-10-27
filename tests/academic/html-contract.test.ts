import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { readPublic } from "../helpers/academic.js";

// Contract J1-01 as stated by the project owner. CONTRAT.md is not yet in the
// repository; update this test if it differs.
const doc = new JSDOM(readPublic("index.html")).window.document;

describe("J1-01 index.html", () => {
  it("déclare la langue et le viewport", () => {
    expect(doc.documentElement.lang).toBe("fr");
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
  });

  it("contient un seul main et un seul h1", () => {
    expect(doc.querySelectorAll("main")).toHaveLength(1);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelector("h1")?.textContent?.trim()).not.toBe("");
  });

  it("a un ul#historique annoncé par aria-live", () => {
    const historique = doc.querySelector("#historique");
    expect(historique?.tagName).toBe("UL");
    expect(["polite", "assertive"]).toContain(historique?.getAttribute("aria-live"));
  });

  it("a un form#formulaire contenant #message et #envoyer", () => {
    const form = doc.querySelector("#formulaire");
    expect(form?.tagName).toBe("FORM");
    expect(form?.querySelector("#message")).not.toBeNull();
    expect(form?.querySelector("#envoyer")).not.toBeNull();
  });

  it("#message est requis, limité et étiqueté", () => {
    const champ = doc.querySelector<HTMLInputElement>("#message");
    expect(champ?.hasAttribute("required")).toBe(true);
    const max = Number(champ?.getAttribute("maxlength"));
    expect(Number.isInteger(max) && max > 0).toBe(true);
    expect(doc.querySelector('label[for="message"]')).not.toBeNull();
  });

  it("#envoyer est un bouton de soumission", () => {
    const bouton = doc.querySelector("#envoyer");
    expect(bouton?.tagName).toBe("BUTTON");
    expect(bouton?.getAttribute("type")).toBe("submit");
  });

  it("fournit #statut, #compteur et #effacer (J1-04)", () => {
    expect(doc.querySelector("#statut")).not.toBeNull();
    expect(doc.querySelector("#compteur")).not.toBeNull();
    expect(doc.querySelector("#effacer")?.getAttribute("type")).toBe("button");
  });

  it("propose un lien d'évitement vers #contenu (bonus)", () => {
    expect(doc.querySelector('a[href="#contenu"]')).not.toBeNull();
    expect(doc.querySelector("#contenu")).not.toBeNull();
  });

  it("n'a pas d'identifiants dupliqués", () => {
    const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("charge brain.js avant app.js, sans module ni CDN", () => {
    const srcs = [...doc.querySelectorAll("script")].map((s) => s.getAttribute("src") ?? "");
    expect(srcs.indexOf("js/brain.js")).toBeGreaterThanOrEqual(0);
    expect(srcs.indexOf("js/brain.js")).toBeLessThan(srcs.indexOf("js/app.js"));
    expect(srcs.every((s) => !/^https?:/.test(s))).toBe(true);
  });
});
