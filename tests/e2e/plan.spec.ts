import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("plan and usage: trial seats, seat limit on invites, and upgrading to Pro", async ({ page }) => {
  await register(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Plan & usage" }).click();
  const panel = page.getByTestId("plan-panel");
  await expect(panel).toContainText("Free trial");
  await expect(panel).toContainText("1 of 3");
  await page.getByTestId("plan-seats").fill("10");
  await page.getByTestId("plan-pro").click();
  await expect(page.getByTestId("plan-msg")).toHaveText("Pro with 10 seats.");
  await expect(panel).toContainText("1 of 10");
  await expect(panel).toContainText("$990 per month");
});
