import { expect, test } from "@playwright/test";
import { consentAndSimulate, openVisit, register } from "./helpers";

test("live draft preview builds the history and plan while the visit is recorded", async ({ page }) => {
  await register(page);
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await page.getByTestId("live-draft-toggle").click();
  const draft = page.getByTestId("live-draft");
  await expect(draft).toContainText(/cough/i);
  await expect(draft).toContainText("Assessment");
});
