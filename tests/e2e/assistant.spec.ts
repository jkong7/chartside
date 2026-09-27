import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("assistant answers from the transcript and edits the note", async ({ page }) => {
  await register(page);
  await openVisit(page, "Maria Gonzalez");
  await consentAndSimulate(page);
  await draftNote(page);

  const input = page.getByLabel("Message Chartside");
  await input.fill("What did she say about the metformin?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("upsets my stomach");
  await expect(page.getByTestId("transcript").locator(".ring-1").first()).toBeVisible();

  await input.fill("add patient declined flu vaccine today to plan");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Added to Assessment & Plan");
  await expect(page.getByTestId("section-assessment_plan")).toContainText("Patient declined flu vaccine today.");

  await page.getByRole("button", { name: "Make the HPI shorter" }).isVisible().catch(() => false);
  await input.fill("make the subjective shorter");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Shortened Subjective");
});
