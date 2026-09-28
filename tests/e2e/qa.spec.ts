import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("reviews a sampled note against the rubric and runs engine test cases", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Note QA" }).click();
  await page.waitForURL("**/qa");
  await expect(page.getByTestId("trust-table")).toContainText("Dr. Avery Chen");
  await page.getByRole("tab", { name: /Review queue/ }).click();
  const items = page.getByTestId("review-item");
  await expect(items.first()).toContainText("new user");
  await items.first().getByTestId("open-review").click();
  await page.waitForURL("**/qa/qa_*");
  await expect(page.getByTestId("qa-transcript")).toContainText("Clinician:");
  for (const k of ["accuracy", "completeness", "attribution", "medications", "coding"]) await page.getByTestId(`score-${k}-4`).click();
  await page.getByTestId("qa-comment").fill("Accurate; add pertinent negatives to the HPI.");
  await page.getByTestId("qa-submit").click();
  await expect(page.getByTestId("qa-done")).toContainText("Reviewed by Dr. Avery Chen");

  await page.goto("/qa");
  await page.getByRole("tab", { name: "Engine test cases" }).click();
  await page.getByTestId("case-name").fill("Diabetes follow-up");
  await page.getByTestId("case-save").click();
  await expect(page.getByTestId("case")).toHaveCount(1);
  await page.getByTestId("case-run").click();
  await expect(page.getByTestId("case-pass")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("1 of 1 test cases passed.");
});
