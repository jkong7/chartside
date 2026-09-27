import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("duplicate and customize a template with live preview", async ({ page }) => {
  await register(page);
  await page.goto("/templates");
  await expect(page.getByTestId("template-preview")).toContainText("ASSESSMENT & PLAN");
  await page.getByTestId("duplicate").click();
  await expect(page.getByRole("status")).toContainText("Duplicated");
  await page.getByLabel("Template name").fill("My clinic SOAP");
  await page.getByLabel("Verbosity").selectOption("concise");
  await page.getByLabel("Section title").first().fill("History");
  await expect(page.getByTestId("template-preview")).toContainText("HISTORY");
  await page.getByTestId("save-template").click();
  await expect(page.getByRole("status")).toContainText("Template saved");
  await page.reload();
  await expect(page.getByTestId("template-list")).toContainText("My clinic SOAP");
});

test("insights show seeded history and learned style rules; settings manage rules", async ({ page }) => {
  await register(page);
  await page.goto("/insights");
  await expect(page.getByTestId("kpis")).toContainText("Notes signed");
  await expect(page.getByTestId("kpis")).toContainText("9");
  await expect(page.getByTestId("learned-rules")).toContainText("Patient verbalized understanding");
  await page.goto("/settings");
  const rules = page.getByTestId("style-rules");
  await expect(rules).toContainText("learned · 2×");
  await page.getByLabel("Rule", { exact: true }).selectOption("always_include");
  await page.getByLabel("Section key").fill("assessment_plan");
  await page.getByLabel("Value").fill("Return precautions reviewed.");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(rules).toContainText('Always add "Return precautions reviewed."');
  const toggle = rules.getByLabel('Toggle Always add "Return precautions reviewed."');
  await expect(toggle).toBeChecked();
  await toggle.dispatchEvent("click");
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId("engine-settings")).toContainText("on-device clinical engine");
});

test("patients: search, add, and start a visit from the chart", async ({ page }) => {
  await register(page);
  await page.goto("/patients");
  await page.getByLabel("Search patients").fill("100482");
  await expect(page.getByTestId("patient-list").locator("a")).toHaveCount(1);
  await page.getByLabel("Search patients").fill("");
  await page.getByRole("button", { name: "Add patient" }).click();
  await page.getByLabel("Full name").fill("Rosa Delgado");
  await page.getByLabel("Date of birth").fill("1971-02-03");
  await page.getByLabel("Allergies (comma separated)").fill("penicillin");
  await page.getByRole("button", { name: "Add patient" }).last().click();
  await expect(page.getByRole("heading", { name: "Rosa Delgado" })).toBeVisible();
  await page.getByRole("button", { name: "Start visit" }).click();
  await expect(page.getByTestId("patient-name")).toHaveText("Rosa Delgado");
  await expect(page.getByTestId("consent-card")).toBeVisible();
});
