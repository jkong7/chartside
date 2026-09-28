import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register, signNote } from "./helpers";

test("shows care gaps before the visit, closes them with one click, blocks signing on blanks, and reports quality", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await expect(page.getByTestId("care-gaps")).toContainText("Kidney health evaluation");
  await consentAndSimulate(page);
  await draftNote(page);

  await page.getByRole("tab", { name: /Quality/ }).click();
  const panel = page.getByTestId("quality-panel");
  await expect(panel.locator('[data-measure="dm_a1c"]')).toHaveAttribute("data-status", /met|addressed/);
  await expect(panel.locator('[data-measure="breast"]')).toHaveAttribute("data-status", "met");

  const depression = panel.locator('[data-measure="depression"]');
  await expect(depression).toHaveAttribute("data-status", "met");

  const bmi = panel.locator('[data-measure="bmi"]');
  if ((await bmi.getAttribute("data-status")) === "gap") {
    await bmi.getByTestId("measure-action").click();
    await expect(bmi).toHaveAttribute("data-status", "met");
  }

  await page.request.post(page.url().replace(/\/encounters\/([^/?]+).*/, "/api/encounters/$1/orders"), { data: {} }).then((r) => expect(r.status()).toBe(400));

  await page.getByRole("tab", { name: "Note" }).click();
  const plan = page.getByTestId("section-assessment_plan");
  await plan.getByTestId("edit-section").click();
  const area = plan.getByTestId("section-textarea");
  await area.fill(`${await area.inputValue()}\nFalls screening: *** falls in the past year.`);
  await plan.getByTestId("save-section").click();
  await page.getByTestId("sign").click();
  await expect(page.getByTestId("sign-blockers")).toContainText("*** blanks to fill in");
  await expect(page.getByTestId("sign-anyway")).toHaveCount(0);
  await page.getByRole("button", { name: "Review first" }).click();
  await plan.getByTestId("edit-section").click();
  await plan.getByTestId("section-textarea").fill((await plan.getByTestId("section-textarea").inputValue()).replace("Falls screening: *** falls in the past year.", "Falls screening: 0 falls in the past year."));
  await plan.getByTestId("save-section").click();
  await signNote(page);

  await page.getByTestId("nav").getByRole("link", { name: "Quality" }).click();
  await page.waitForURL("**/quality");
  await expect(page.getByTestId("quality-kpis")).toContainText("Patients measured");
  const bp = page.getByTestId("quality-row").filter({ hasText: "Controlling high blood pressure" });
  await expect(bp).toContainText("CMS165");
  await expect(page.getByTestId("gap-list")).toBeVisible();
});

test("pediatric brief lists vaccines due on the CDC schedule", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Sofia Ramirez" }).click();
  await expect(page.getByTestId("care-gaps")).toContainText("Immunizations due on the CDC schedule");
  await expect(page.getByTestId("care-gaps")).toContainText("DTaP dose 5");
  await expect(page.getByTestId("care-gaps")).toContainText("MMR dose 2");
});
