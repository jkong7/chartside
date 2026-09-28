import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register } from "./helpers";

test("dictates into the note with voice commands, snippets, and personal vocabulary", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await page.getByTestId("vocab-term").fill("tirzepatide");
  await page.getByTestId("vocab-add").click();
  await expect(page.getByTestId("vocab-entry")).toContainText("tirzepatide");
  await page.getByTestId("snippet-new").click();
  await page.getByTestId("snippet-trigger").fill("dmfoot");
  await page.getByTestId("snippet-name").fill("Diabetic foot exam");
  await page.getByTestId("snippet-body").fill("Monofilament sensation intact bilaterally for {{patient.first}}; pedal pulses 2+.");
  await page.getByTestId("snippet-save").click();
  await expect(page.getByTestId("snippet-list")).toContainText("Diabetic foot exam");

  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);

  const subjective = page.getByTestId("section-subjective");
  await subjective.getByTestId("edit-section").click();
  const area = subjective.getByTestId("section-textarea");
  await area.press("End");
  await area.press("Control+End");
  await area.pressSequentially("\n/dmfoot ");
  await expect(area).toHaveValue(/Monofilament sensation intact bilaterally for Maria; pedal pulses 2\+\./);
  await subjective.getByTestId("save-section").click();
  await expect(subjective).toContainText("Monofilament sensation intact bilaterally for Maria");

  await page.getByTestId("dictate").click();
  await expect(page.getByTestId("dictation-bar")).toContainText("Dictating into");
  await expect(page.getByTestId("dictation-bar")).toHaveCount(0, { timeout: 20_000 });
  const plan = page.getByTestId("section-assessment_plan");
  await expect(plan.getByTestId("section-textarea")).toHaveValue(/- Continue metformin 1000 milligrams twice daily\.$/);
  await plan.getByTestId("save-section").click();
  await expect(plan).toContainText("Continue metformin 1000 milligrams twice daily.");
  await expect(subjective).toContainText("Energy is much better since the last visit.");
  await expect(subjective).toContainText("Lungs clear to auscultation bilaterally");
  await expect(subjective).not.toContainText("Mistake line here");

  const stats = (await (await page.request.get("http://localhost:3299/stats")).json()) as { dictationConnections: number; lastKeyterms: string[] };
  expect(stats.dictationConnections).toBeGreaterThan(0);
  expect(stats.lastKeyterms).toContain("tirzepatide");
});

test("switches note detail level and remembers 'always' rewrite instructions as style rules", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);
  const words = async () => Number((await page.getByTestId("section-subjective").locator("header span").first().textContent())!.split(" ")[0]);
  const standard = await words();
  await expect(page.getByTestId("detail-standard")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("detail-concise").click();
  await expect(page.getByTestId("detail-concise")).toHaveAttribute("aria-checked", "true");
  await expect.poll(words).toBeLessThan(standard);
  await page.getByTestId("detail-detailed").click();
  await expect(page.getByTestId("detail-detailed")).toHaveAttribute("aria-checked", "true");
  await expect.poll(words).toBeGreaterThan(standard);

  const input = page.getByLabel("Message Chartside");
  await input.fill("Always write the subjective as bullets");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Subjective now uses bullet points. I'll do this in future notes too");
  await expect(page.getByTestId("section-subjective").locator("ul")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("style-rules")).toContainText("Write Subjective as bullet points");
});
