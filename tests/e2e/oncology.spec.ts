import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register, signNote } from "./helpers";

test("oncology treatment visit: CTCAE toxicities, ECOG, dose reduction, high MDM, and the treatment timeline", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Diane Porter" }).click();
  await consentAndSimulate(page);
  await draftNote(page);

  await expect(page.getByTestId("section-onc_history")).toContainText("Stage IIIB (T3 N1b M0) cancer of the sigmoid colon, KRAS wild type");
  const tox = page.getByTestId("section-toxicity");
  await expect(tox).toContainText("Peripheral sensory neuropathy: grade 2 (CTCAE v5.0)");
  await expect(tox).toContainText("Neutrophil count decreased: grade 2 (CTCAE v5.0), ANC 1.2.");
  const plan = page.getByTestId("section-treatment");
  await expect(plan).toContainText("FOLFOX (oxaliplatin, leucovorin, fluorouracil), adjuvant, cycle 6.");
  await expect(plan).toContainText("ECOG performance status 1.");
  await expect(plan).toContainText("Dose reduce oxaliplatin by 20%");
  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByRole("tab", { name: /Codes/ })).toContainText("99215");
  await expect(page.getByText("T45.1X5A").first()).toBeVisible();
  await page.getByRole("tab", { name: "Note" }).click();
  await signNote(page);

  await page.goto("/patients");
  await page.getByRole("link", { name: /Diane Porter/ }).first().click();
  await page.waitForURL("**/patients/pat_*");
  const card = page.getByTestId("oncology-card");
  await expect(card.getByTestId("onc-dx")).toContainText("Stage IIIB cancer of the sigmoid colon (T3 N1b M0)");
  await expect(card.getByTestId("onc-ecog")).toContainText("ECOG 1");
  await expect(card.getByTestId("onc-regimens")).toContainText("6 cycles");
  await expect(card.getByTestId("onc-toxicity")).toContainText("C6");
});
