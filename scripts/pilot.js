/* global document -- used inside page.waitForFunction, which runs in the browser */
// Piloted test of the running app (http://127.0.0.1:3000), with the LLM if configured.
// Usage: node scripts/pilot.js [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.XDMFS_URL ?? "http://127.0.0.1:3000";
const out = process.argv[2] ?? "docs/evidence/pilot";
mkdirSync(out, { recursive: true });

const questions = [
  "Quels tickets sont bloqués par SonarQube ?",
  "Quelle est la chaîne de livraison de PAY-6 et que manque-t-il ?",
  "Quels changements partent en production sans ticket ?",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`${base}/tracabilite/`);
await page.waitForSelector("#table-tickets tr");
await page.screenshot({ path: `${out}/01-dashboard.png`, fullPage: true });
console.log(
  "KPI tickets:",
  await page.textContent("#kpi-tickets"),
  "| mode:",
  await page.textContent("#badge-llm"),
);

for (const [i, q] of questions.entries()) {
  const before = await page.locator(".bubble-bot").count();
  await page.fill("#question", q);
  await page.click("#envoyer-question");
  await page.waitForFunction((n) => document.querySelectorAll(".bubble-bot").length > n, before, {
    timeout: 120_000,
  });
  const answer = await page.locator(".bubble-bot").last().innerText();
  console.log(`\n=== Q${i + 1}: ${q}\n${answer}`);
}
await page.locator("#assistant").screenshot({ path: `${out}/02-assistant.png` });

await page.goto(`${base}/`);
await page.fill("#message", "bonjour");
await page.press("#message", "Enter");
await page.waitForSelector('#historique li[data-role="bot"]');
console.log("\n=== Chatbot J1:", await page.locator('#historique li[data-role="bot"]').innerText());
await page.screenshot({ path: `${out}/03-chatbot-j1.png` });

console.log("\nConsole errors:", errors.length ? errors : "none");
await browser.close();
