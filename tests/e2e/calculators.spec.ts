import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register } from "./helpers";

test("runs calculators prefilled from the chart and inserts the result into the note", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);

  await page.getByTestId("open-calculators").click();
  const calc = page.getByTestId("calculators");
  await expect(calc.getByTestId("calc-egfr")).toContainText("suggested");
  await calc.getByTestId("calc-cha2ds2vasc").click();
  await expect(calc.getByTestId("in-htn")).toBeChecked();
  await expect(calc.getByTestId("in-diabetes")).toBeChecked();
  await expect(calc.getByTestId("in-age")).toHaveValue("58");
  await expect(calc.getByTestId("calc-value")).toHaveText("3 points");
  await calc.getByTestId("in-stroke").check();
  await expect(calc.getByTestId("calc-value")).toHaveText("5 points");
  await calc.getByTestId("calc-insert").click();
  await expect(calc.getByRole("status")).toContainText("Added");

  await calc.getByTestId("calc-egfr").click();
  await calc.getByTestId("in-scr").fill("1.0");
  await expect(calc.getByTestId("calc-value")).toHaveText("65 mL/min/1.73m²");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-assessment_plan")).toContainText("CHA2DS2-VASc score 5; anticoagulation recommended.");
});

test("answers guideline questions from the evidence library with sources", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);
  const input = page.getByLabel("Message Chartside");
  await input.fill("When should lung cancer screening start and who qualifies?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("20 pack-year");
  await expect(page.getByTestId("evidence-sources").last()).toContainText("USPSTF 2021: Lung cancer screening");
});
