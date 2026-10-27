import { describe, expect, it } from "vitest";
import { readPublic } from "../helpers/academic.js";
import { contrast } from "../helpers/contrast.js";

const css = readPublic("css/style.css");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = tokens(css.slice(css.indexOf(":root {"), darkStart));
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf("*,", darkStart))) };

// Text / background pairs actually used by the stylesheet.
const PAIRS: Array<[string, string]> = [
  ["texte", "fond"],
  ["texte", "surface"],
  ["texte-attenue", "fond"],
  ["texte-attenue", "surface"],
  ["sur-primaire", "primaire"],
  ["primaire", "fond"],
  ["sur-bulle-bot", "bulle-bot"],
  ["sur-bulle-user", "bulle-user"],
  ["erreur", "fond"],
  ["avertissement", "fond"],
];

describe("J1-02 contraste (WCAG AA, 4.5:1)", () => {
  for (const [theme, t] of [
    ["clair", light],
    ["sombre", dark],
  ] as const) {
    for (const [fg, bg] of PAIRS) {
      it(`${theme} : --${fg} sur --${bg}`, () => {
        expect(t[fg], `token --${fg}`).toBeDefined();
        expect(t[bg], `token --${bg}`).toBeDefined();
        expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("le contour de focus contraste à 3:1 avec le fond (non-texte)", () => {
    expect(contrast(light.focus!, light.fond!)).toBeGreaterThanOrEqual(3);
    expect(contrast(dark.focus!, dark.fond!)).toBeGreaterThanOrEqual(3);
  });
});

describe("J1-02 règles structurelles", () => {
  it("rend le focus visible", () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px/);
  });
  it("coupe les mots longs dans les messages", () => {
    expect(css).toMatch(/\.msg\s*{[^}]*overflow-wrap:\s*anywhere/);
  });
  it("propose un thème sombre (bonus)", () => {
    expect(darkStart).toBeGreaterThan(0);
  });
  it("adapte la mise en page aux petits écrans", () => {
    expect(css).toMatch(/@media \(max-width: 480px\)/);
  });
  it("n'impose pas de largeur fixe supérieure à 360 px", () => {
    for (const m of css.matchAll(/(?<![-\w])width:\s*(\d+)px/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(360);
    }
  });
});
