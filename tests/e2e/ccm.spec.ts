import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("care management: enroll an eligible patient with consent, log practitioner time, and reach a billable month", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Care management" }).click();
  await page.waitForURL("**/care-management");
  const eligible = page.getByTestId("ccm-eligible").locator("li").filter({ hasText: "Maria Gonzalez" });
  await expect(eligible).toContainText("Type 2 diabetes mellitus");
  await eligible.getByTestId("ccm-enroll").click();
  await page.getByTestId("ccm-consent").selectOption("verbal");
  await page.getByTestId("ccm-enroll-save").click();
  const row = page.getByTestId("ccm-row").filter({ hasText: "Maria Gonzalez" });
  await expect(row).toBeVisible();
  await row.getByTestId("ccm-plan").click();
  await expect(page.getByTestId("ccm-careplan")).toContainText("Goal: Blood pressure under 130/80");
  await page.keyboard.press("Escape");
  await row.getByTestId("ccm-log").click();
  await page.getByTestId("ccm-minutes-input").fill("32");
  await page.getByTestId("ccm-activity").selectOption("Medication management");
  await page.getByTestId("ccm-log-save").click();
  await expect(row.getByTestId("ccm-codes")).toHaveText("99491");
  await expect(page.getByTestId("ccm-export")).toContainText("(1)");
  const csv = await (await page.request.get(await page.getByTestId("ccm-export").getAttribute("href") ?? "")).text();
  expect(csv).toContain('"99491x1"');
});
