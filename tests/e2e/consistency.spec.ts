import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("consistency checks flag a contradiction introduced by an edit and hold signing", async ({ page }) => {
  await register(page);
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await draftNote(page);
  await expect(page.getByTestId("consistency")).toHaveCount(0);
  const subj = page.getByTestId("section-subjective");
  await subj.getByTestId("edit-section").click();
  const area = subj.getByTestId("section-textarea");
  await area.fill(`${await area.inputValue()} He denies cough.`);
  await subj.getByTestId("save-section").click();
  await expect(page.getByTestId("consistency-issue")).toContainText("Cough is documented as both present and denied.");
  await expect(page.getByTestId("consistency-count")).toHaveText("1 consistency issue");
  await page.getByTestId("sign").click();
  await expect(page.getByTestId("sign-blockers")).toContainText("Cough is documented as both present and denied.");
});
