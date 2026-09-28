import { expect, test } from "@playwright/test";
import { consentAndSimulate, openVisit, register } from "./helpers";

test("getting-started checklist tracks real progress and can be dismissed", async ({ page }) => {
  await register(page);
  const card = page.getByTestId("onboarding");
  await expect(card).toContainText("Getting started · 0 of 5");
  await expect(card.getByTestId("onboarding-item").filter({ hasText: "Record a visit" })).toHaveAttribute("data-done", "false");
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await page.goto("/today");
  await expect(card.getByTestId("onboarding-item").filter({ hasText: "Record a visit" })).toHaveAttribute("data-done", "true");
  await expect(card).toContainText("1 of 5");
  await card.getByTestId("onboarding-dismiss").click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("onboarding")).toHaveCount(0);
});
