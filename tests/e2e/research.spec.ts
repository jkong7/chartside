import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("research pre-screening: admin adds a study, the visit flags the patient, the clinician refers", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Research" }).click();
  await page.waitForURL("**/research");
  await page.getByTestId("trial-new").click();
  await page.getByTestId("trial-title").fill("Sample: CGM coaching for type 2 diabetes");
  await page.getByTestId("trial-contact").fill("research@clinic.test");
  await page.getByTestId("trial-min-age").fill("40");
  await page.getByTestId("trial-max-age").fill("75");
  await page.getByTestId("trial-dx").fill("E11");
  await page.getByTestId("trial-labs").fill("Hemoglobin A1c >= 7.5");
  await page.getByTestId("trial-save").click();
  const card = page.getByTestId("trial-card");
  await expect(card).toContainText("Hemoglobin A1c >= 7.5");
  await expect(card.getByTestId("trial-candidates")).toContainText("Maria Gonzalez");

  await openVisit(page, "Maria Gonzalez");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.getByRole("tab", { name: /Quality/ }).click();
  const match = page.getByTestId("trial-match");
  await expect(match).toContainText("Meets listed criteria");
  await match.getByTestId("trial-refer").click();
  await expect(match.getByTestId("trial-referred")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Tasks/ }).click();
  await expect(page.getByText("Send pre-screen to study team: Sample: CGM coaching for type 2 diabetes")).toBeVisible();

  await page.goto("/research");
  await expect(page.getByTestId("trial-card")).toContainText("1 referred");
});
