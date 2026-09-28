import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("pre-bill review on the demo admission shows POA indicators and any documentation queries", async ({ page }) => {
  await register(page);
  await page.goto("/hospital");
  await page.getByTestId("census-patient").filter({ hasText: "Harold Jensen" }).click();
  await page.waitForURL("**/hospital/adm_*");
  await page.getByRole("tab", { name: "Pre-bill review" }).click();
  const poa = page.getByTestId("poa");
  await expect(poa).toContainText("I50.30");
  await expect(poa.locator("li").filter({ hasText: "I50.30" })).toContainText("Documented in the admission H&P");
  await expect(page.getByTestId("cdi-query").or(page.getByTestId("cdi-none")).first()).toBeVisible();
});
