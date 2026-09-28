import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("order sets: one click stages a bundle, duplicates are skipped, and a personal set can be saved", async ({ page }) => {
  await register(page);
  await openVisit(page, "Maria Gonzalez");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.getByRole("tab", { name: /Orders/ }).click();
  await page.getByTestId("order-set").filter({ hasText: "Diabetes annual" }).click();
  await expect(page.getByTestId("order-set-applied")).toContainText("Diabetes annual: added");
  await expect(page.getByTestId("orders-panel")).toContainText("Referral to Podiatry");
  await page.getByTestId("order-set").filter({ hasText: "Diabetes annual" }).click();
  await expect(page.getByTestId("order-set-applied")).toContainText("added 0");
  await page.getByTestId("order-set-new").click();
  await page.getByTestId("order-set-name").fill("My diabetes bundle");
  await page.getByTestId("order-set-save").click();
  await expect(page.getByTestId("order-set-msg")).toContainText('Saved "My diabetes bundle".');
  await expect(page.getByTestId("order-set").filter({ hasText: "My diabetes bundle" })).toContainText("mine");
});
