import { expect, test } from "@playwright/test";
import { draftNote, register } from "./helpers";

test("unscheduled visit from a pasted transcript", async ({ page }) => {
  await register(page);
  await page.getByRole("button", { name: "Unscheduled visit" }).click();
  await page.getByLabel("Patient").selectOption({ label: "James Carter" });
  await page.getByLabel("Reason for visit").fill("Sore throat");
  await page.getByRole("button", { name: "Open visit" }).click();
  await expect(page.getByTestId("consent-card")).toBeVisible();
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await page.getByTestId("start-type").click();
  await page.getByText("Paste a whole transcript").click();
  await page.getByTestId("paste-input").fill(
    [
      "Dr: What brings you in today?",
      "Patient: My throat has been sore for three days and it hurts to swallow.",
      "Dr: Any fever?",
      "Patient: Yes, a fever of 101 last night.",
      "Dr: Any cough?",
      "Patient: No.",
      "Dr: Your throat is red with swollen tonsils. Let me swab your throat for strep.",
      "Dr: The rapid strep test is positive, so this is strep throat.",
      "Dr: I'm going to prescribe amoxicillin 500 milligrams twice a day for 10 days.",
      "Dr: If you have trouble breathing or can't swallow fluids, go to the ER.",
      "Dr: Follow up in 1 week if not better. Any questions?",
    ].join("\n"),
  );
  await page.getByTestId("paste-add").click();
  await expect(page.getByTestId("transcript").locator("[data-uid]")).toHaveCount(11);
  await expect(page.getByTestId("coverage-score")).not.toHaveText("0%");
  await draftNote(page);
  const ap = page.getByTestId("section-assessment_plan");
  await expect(ap).toContainText("Streptococcal pharyngitis (J02.0)");
  await expect(ap).toContainText("Start amoxicillin 500 mg twice daily for 10 days.");
  await expect(page.getByTestId("section-subjective")).toContainText("sore throat for 3 days");
  await page.getByRole("tab", { name: /Orders/ }).click();
  await expect(page.getByTestId("order-row").filter({ hasText: "Rapid strep antigen" })).toBeVisible();
});
