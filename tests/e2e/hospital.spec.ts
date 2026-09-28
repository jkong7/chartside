import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register, signNote } from "./helpers";

test("hospitalist rounds: census, progress note with changes and carry-forward, handoff, and discharge summary", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await expect(page.getByTestId("visit-row").filter({ hasText: "Harold Jensen" })).toHaveCount(0);

  await page.getByTestId("nav").getByRole("link", { name: "Hospital" }).click();
  await page.waitForURL("**/hospital");
  const row = page.getByTestId("census-row").filter({ hasText: "Harold Jensen" });
  await expect(row).toContainText("412");
  await expect(row).toContainText("Day 3");

  await row.getByTestId("toggle-handoff").click();
  await expect(page.getByTestId("handoff-summary")).toHaveValue(/admitted for acute on chronic heart failure exacerbation, hospital day 3/);
  await page.getByTestId("severity-watcher").click();
  await page.getByTestId("handoff-save").click();
  await expect(row.locator(".pill").filter({ hasText: "Watcher" })).toBeVisible();

  await row.getByTestId("start-progress").click();
  await page.waitForURL("**/encounters/**");
  await expect(page.getByTestId("admission-chip")).toContainText("Hospital day 3");
  await expect(page.getByTestId("consent-card")).toBeVisible();
  await consentAndSimulate(page);
  await draftNote(page);
  const interval = page.getByTestId("section-interval");
  await expect(interval).toContainText("Changes Since Yesterday (Hospital Day 3)");
  await expect(interval).toContainText("Weight 90 kg, down 2 kg from 92 kg yesterday.");
  await expect(interval).toContainText("Creatinine 1.3 mg/dL (down from 1.5)");
  await expect(page.getByTestId("carried-label").first()).toHaveText("Carried forward · verify");
  const ap = page.getByTestId("section-ap");
  await expect(ap.getByTestId("pending-defaults")).toContainText("atrial fibrillation");
  await ap.getByTestId("accept-default").first().click();
  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByRole("tab", { name: /Codes/ })).toContainText(/9923[123]/);
  await page.getByRole("tab", { name: "Note" }).click();
  await signNote(page);

  await page.getByTestId("admission-chip").click();
  await page.waitForURL("**/hospital/adm_*");
  await expect(page.getByTestId("admission-notes")).toContainText("Progress note");
  await expect(page.getByTestId("hospital-course")).toContainText("Day 3:");
  await page.getByTestId("admission-discharge").click();
  await page.waitForURL("**/encounters/**");
  await consentAndSimulate(page);
  await draftNote(page);
  await expect(page.getByTestId("section-dc_dx")).toContainText("Acute on chronic diastolic (congestive) heart failure (I50.33)");
  await expect(page.getByTestId("section-dc_meds")).toContainText("New: potassium chloride 20 mg daily");
  await expect(page.getByTestId("section-dc_course")).toContainText("Weight 94 kg on admission to 89.5 kg at discharge.");
  await expect(page.getByTestId("section-dc_followup")).toContainText("Referral to Cardiology");
  await signNote(page);

  await page.goto("/hospital");
  await expect(page.getByTestId("census-row").filter({ hasText: "Harold Jensen" })).toHaveCount(0);
  await page.goto("/hospital/handoff");
  await expect(page.getByTestId("handoff-table")).toBeVisible();
});

test("admits a new patient from the census and starts the admission H&P", async ({ page }) => {
  await register(page);
  await page.goto("/hospital");
  await page.getByTestId("admit").click();
  await page.getByTestId("admit-patient").selectOption({ label: "Maria Gonzalez · MRN 100482" });
  await page.getByTestId("admit-unit").fill("5 East");
  await page.getByTestId("admit-room").fill("508");
  await page.getByTestId("admit-reason").fill("Diabetic ketoacidosis");
  await page.getByTestId("admit-save").click();
  await page.waitForURL("**/encounters/**");
  await expect(page.getByTestId("admission-chip")).toContainText("5 East 508 · Hospital day 1");
  await page.goto("/hospital");
  await expect(page.getByTestId("census-row")).toHaveCount(2);
  await expect(page.getByTestId("census-row").filter({ hasText: "Maria Gonzalez" }).getByTestId("today-note")).toContainText("H&P");
});

test("nurse documents an assessment by voice or text into the flowsheet and works the care list", async ({ page, browser }) => {
  await register(page);
  await page.goto("/admin");
  const email = `nurse-${Date.now()}@chartside.test`;
  await page.fill("#invite-email", email);
  await page.selectOption("#invite-role", "nurse");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!;

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rn = await ctx.newPage();
  await rn.goto(link);
  await rn.fill("#name", "Nina Park, RN");
  await rn.fill("#password", "correct-horse-9");
  await rn.click("button[type=submit]");
  await rn.waitForURL("**/today");
  await rn.getByTestId("nav").getByRole("link", { name: "Hospital" }).click();
  const row = rn.getByTestId("census-row").filter({ hasText: "Harold Jensen" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("start-progress")).toHaveCount(0);
  await row.getByTestId("census-patient").click();
  await expect(rn.getByTestId("nursing-panel")).toBeVisible();

  await rn.getByTestId("nursing-demo").click();
  await rn.getByTestId("nursing-extract").click();
  const review = rn.getByTestId("nursing-review");
  await expect(review).toContainText("Blood pressure");
  await expect(review).toContainText("+ Add to care list: Needs the IV removed before discharge");
  await rn.getByTestId("nursing-file").click();
  await expect(rn.getByTestId("flowsheet")).toContainText("128/74 mmHg");
  await expect(rn.getByTestId("flowsheet")).toContainText("A&O x4");
  await expect(rn.getByTestId("care-list")).toContainText("Recheck potassium at noon");

  await rn.getByTestId("nursing-demo").click();
  await rn.getByTestId("nursing-extract").click();
  await expect(rn.getByTestId("nursing-review")).toContainText("Done: Recheck potassium at noon");
  await rn.getByTestId("nursing-file").click();
  await expect(rn.getByTestId("care-list")).not.toContainText("Recheck potassium at noon");
  await expect(rn.getByTestId("shift-summary")).toContainText("Latest vitals: BP 124/70 mmHg");

  await rn.getByTestId("shift-question").fill("What has his blood pressure been?");
  await rn.getByTestId("shift-question").press("Enter");
  await expect(rn.getByTestId("shift-answer")).toContainText("128/74 mmHg");
  await expect(rn.getByTestId("shift-answer")).toContainText("124/70 mmHg");
  await ctx.close();
});
