import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("ask the chart on the patient page answers with dates and citations", async ({ page }) => {
  await register(page);
  await page.goto("/patients");
  await page.getByRole("link", { name: /Maria Gonzalez/ }).first().click();
  const ask = page.getByTestId("ask-chart");
  await ask.getByTestId("ask-input").fill("When was the last colonoscopy?");
  await ask.getByTestId("ask-submit").click();
  await expect(ask.getByTestId("ask-answer")).toContainText("Most recent: Colonoscopy: Normal on May 20, 2019.");
  await ask.getByTestId("ask-input").fill("any allergies");
  await ask.getByTestId("ask-submit").click();
  await expect(ask.getByTestId("ask-answer")).toContainText("Allergies on file: sulfa (hives).");
});
