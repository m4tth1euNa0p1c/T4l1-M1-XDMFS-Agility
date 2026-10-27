import { describe, expect, it } from "vitest";
import { readPublic } from "../helpers/academic.js";
import { contrast } from "../helpers/contrast.js";

const css = readPublic("tracabilite/style.css");
const js = readPublic("tracabilite/app.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const html = readPublic("tracabilite/index.html");

const tokens: Record<string, string> = {};
for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]!] = m[2]!;

// Text / background pairs used by the dashboard (Stitch palette, adjusted for AA).
const PAIRS: Array<[string, string]> = [
  ["text", "card"],
  ["text", "canvas"],
  ["text-2", "card"],
  ["muted", "card"],
  ["muted", "canvas"],
  ["blue", "card"],
  ["blue", "blue-wash"],
  ["ok", "ok-wash"],
  ["warn", "warn-wash"],
  ["danger", "danger-wash"],
  ["danger-solid", "card"],
  ["demo", "demo-wash"],
  ["text-2", "neutral-wash"],
];

describe("tableau de traçabilité : contraste WCAG AA", () => {
  for (const [fg, bg] of PAIRS) {
    it(`--${fg} sur --${bg} >= 4.5:1`, () => {
      expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("texte blanc sur les fonds pleins (navy, ok, danger)", () => {
    for (const bg of ["navy", "ok-solid", "danger-solid"])
      expect(contrast("#ffffff", tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("tableau de traçabilité : sécurité du rendu", () => {
  it("n'utilise jamais innerHTML, outerHTML, insertAdjacentHTML ni eval", () => {
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function/);
  });
  it("ne charge aucune ressource externe et aucun script inline", () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script>(?!<\/script>)/);
    expect(html).not.toMatch(/\son[a-z]+="/);
  });
});
