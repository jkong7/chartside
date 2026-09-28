import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("risk adjustment worklist lists Medicare recapture and evidence suspects", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Risk adjustment" }).click();
  await page.waitForURL("**/risk");
  await expect(page.getByTestId("risk-kpis")).toContainText("RAF at stake");
  const rows = page.getByTestId("risk-row");
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId("risk-list")).toContainText("Harold Jensen");
  await expect(page.getByTestId("risk-list")).toContainText("HCC");
});
