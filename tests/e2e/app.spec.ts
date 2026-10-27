import { expect, test } from "@playwright/test";

test.describe("Chatbot académique J1", () => {
  test("envoi au clic et à Entrée, compteur, effacer", async ({ page }) => {
    await page.goto("/");
    const champ = page.locator("#message");
    await champ.fill("bonjour");
    await expect(page.locator("#compteur")).toHaveText("7 / 200");
    await page.locator("#envoyer").click();
    await expect(page.locator("#historique li.msg")).toHaveCount(2);
    await expect(page.locator('#historique li[data-role="bot"]')).toContainText("Agilo");

    await champ.fill("jira");
    await champ.press("Enter");
    await expect(page.locator("#historique li.msg")).toHaveCount(4);
    await expect(champ).toBeFocused();

    await page.locator("#effacer").click();
    await expect(page.locator("#historique li")).toHaveCount(0);
    await expect(page.locator("#statut")).toHaveText("Conversation effacée.");
  });

  test("message vide refusé et annoncé", async ({ page }) => {
    await page.goto("/");
    await page.locator("#envoyer").click();
    await expect(page.locator("#statut")).toHaveText("Le message est vide.");
    await expect(page.locator("#message")).toHaveAttribute("aria-invalid", "true");
  });

  test("un mot de 200 caractères ne déborde pas horizontalement", async ({ page }) => {
    await page.goto("/");
    await page.locator("#message").fill("x".repeat(200));
    await page.locator("#envoyer").click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("navigation clavier : lien d'évitement puis champ", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(".lien-evitement")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
  });

  test("aucune erreur console ni requête externe", async ({ page }) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on(
      "request",
      (r) => !r.url().startsWith("http://127.0.0.1:3100") && external.push(r.url()),
    );
    await page.goto("/");
    await page.locator("#message").fill("aide");
    await page.locator("#envoyer").click();
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
});

test.describe("Tableau de traçabilité", () => {
  test("charge le projet bancaire de démonstration", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/tracabilite/");
    await expect(page.locator("#badge-demo")).toBeVisible();
    await expect(page.locator("#kpi-tickets")).toHaveText("18");
    await expect(page.locator("#liste-orgs li")).toHaveCount(4);
    await expect(page.locator("#liste-risques")).toContainText("PAY-18");
    await expect(page.locator("#table-tickets tr")).toHaveCount(18);
    await expect(page.locator("#table-qualite")).toContainText("#13");
    expect(errors).toEqual([]);
  });

  test("affiche la chaîne de livraison et les manques", async ({ page }) => {
    await page.goto("/tracabilite/");
    await expect(page.locator("#chaine-titre")).toContainText("PAY-6");
    await expect(page.locator("#stepper li")).toHaveCount(7);
    await expect(page.locator("#chaine-manques")).toContainText("Livraison partielle");
    await page.locator("#choix-ticket").selectOption("PAY-7");
    await expect(page.locator("#chaine-titre")).toContainText("PAY-7");
    await expect(page.locator('#stepper li[data-status="failed"]')).toContainText("SonarQube");
  });

  test("l'assistant répond avec sources et limites", async ({ page }) => {
    await page.goto("/tracabilite/");
    await expect(page.locator("#kpi-tickets")).toHaveText("18");
    await page.locator("#question").fill("Quels tickets sont bloqués par SonarQube ?");
    await page.locator("#envoyer-question").click();
    const reponse = page.locator(".bubble-bot").last();
    await expect(reponse).toContainText("PAY-5");
    await expect(reponse).toContainText("Sources");
    await expect(reponse).toContainText("Limites");
  });

  test("pas de défilement horizontal de la page", async ({ page }) => {
    await page.goto("/tracabilite/");
    await expect(page.locator("#kpi-tickets")).toHaveText("18");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
