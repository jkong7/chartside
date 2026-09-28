import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("fax a referral letter to a specialist and log it in the outbox", async ({ page }) => {
  await register(page);
  await openVisit(page, "Maria Gonzalez");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.getByRole("tab", { name: /Documents/ }).click();
  await page.getByTestId("documents-panel").getByText(/Referral letter · drafted from the visit/).first().click();
  await page.getByTestId("fax-open").click();
  await page.getByTestId("fax-to").fill("312-555-0199");
  await page.getByTestId("fax-send").click();
  await expect(page.getByTestId("fax-msg")).toHaveText("Faxed to +•••••••0199");
  const faxes = await (await page.request.get("http://localhost:3295/faxes")).json();
  expect(faxes.at(-1)).toMatchObject({ to: "+13125550199" });
  await page.getByTestId("fax-to").fill("123");
  await page.getByTestId("fax-send").click();
  await expect(page.getByTestId("fax-msg")).toHaveText("Enter a 10-digit US fax number");
});
