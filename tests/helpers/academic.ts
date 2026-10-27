import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PUBLIC = path.join(ROOT, "public");

const require = createRequire(import.meta.url);

export interface Validation {
  valide: boolean;
  texte: string;
  erreur: string | null;
}
export interface Regle {
  motsCles: string[];
  reponse: string;
}
export interface Assistant {
  nom: string;
  reponseParDefaut: string;
}
export interface BrainModule {
  LIMITE_PAR_DEFAUT: number;
  normaliser(texte: string): string;
  validerMessage(texte: unknown, limite?: unknown): Validation;
  repondre(texte: unknown, regles: unknown, assistant: unknown): string;
}

export function loadBrain(): BrainModule {
  return require(path.join(PUBLIC, "js/brain.js")) as BrainModule;
}

export function loadRegles(): { ASSISTANT: Assistant; REGLES: Regle[] } {
  return require(path.join(PUBLIC, "js/regles.js")) as { ASSISTANT: Assistant; REGLES: Regle[] };
}

export function readPublic(relative: string): string {
  return readFileSync(path.join(PUBLIC, relative), "utf8");
}

/**
 * Loads index.html in jsdom and runs the page scripts in the order declared
 * by the <script src> tags, as a browser would with file://.
 */
export function loadPage(): JSDOM {
  const html = readPublic("index.html");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const scripts = [...dom.window.document.querySelectorAll("script[src]")].map((s) =>
    s.getAttribute("src"),
  );
  for (const src of scripts) {
    if (src) dom.window.eval(readPublic(src));
  }
  return dom;
}
