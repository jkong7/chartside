import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("security and compliance center shows safeguard checks and exports the audit log", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Compliance" }).click();
  await page.waitForURL("**/compliance");
  const checks = page.getByTestId("compliance-checks");
  await expect(checks.getByTestId("compliance-check").filter({ hasText: "Recording consent" })).toHaveAttribute("data-status", "pass");
  await expect(checks.getByTestId("compliance-check").filter({ hasText: "Two-step verification" })).toHaveAttribute("data-status", "fail");
  const csv = await (await page.request.get("/api/admin/audit-export")).text();
  expect(csv.split("\n")[0]).toBe("When,Who,Action,Visit,Detail");
  expect(csv.split("\n").length).toBeGreaterThan(5);
});
