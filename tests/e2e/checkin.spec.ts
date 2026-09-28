import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register, signNote } from "./helpers";

test("post-visit check-in: schedule after signing, patient answers, triaged message reaches the inbox", async ({ page, browser }) => {
  await register(page);
  await openVisit(page, "Maria Gonzalez");
  await consentAndSimulate(page);
  await draftNote(page);
  await signNote(page);
  await page.getByRole("tab", { name: /Patient summary/ }).click();
  const card = page.getByTestId("checkin-card");
  await card.getByTestId("checkin-days").selectOption("0");
  await card.getByTestId("checkin-schedule").click();
  const link = (await card.getByTestId("checkin-link").getAttribute("href"))!;

  const patient = await (await browser.newContext()).newPage();
  await patient.goto(link);
  await patient.getByTestId("checkin-overall-worse").check({ force: true });
  await patient.getByTestId("checkin-note").fill("Dizzy when I stand up");
  await patient.getByTestId("checkin-submit").click();
  await expect(patient.getByTestId("checkin-done")).toContainText("Your care team will call you today");

  await page.reload();
  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await expect(page.getByTestId("checkin-status")).toContainText("Feeling worse since the visit");
  await page.goto("/inbox");
  await expect(page.getByText(/Check-in: needs attention|Post-visit check-in/).first()).toBeVisible();
});
