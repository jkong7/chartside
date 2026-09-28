import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register, signNote } from "./helpers";

test("emergency department: track board, pickup, ED note with timed course and disposition, admit from the ED", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await expect(page.getByTestId("visit-row").filter({ hasText: "Marcus Hill" })).toHaveCount(0);

  await page.getByTestId("nav").getByRole("link", { name: "Emergency" }).click();
  await page.waitForURL("**/ed");
  const board = page.getByTestId("ed-board");
  await expect(board.getByTestId("ed-row")).toHaveCount(2);
  await expect(board.getByTestId("ed-row").first()).toContainText("Marcus Hill");
  const tyler = board.getByTestId("ed-row").filter({ hasText: "Tyler Brooks" });
  await expect(tyler.getByTestId("ed-stage")).toHaveText("Waiting");
  await tyler.getByTestId("ed-bed-input").fill("Fast 3");
  await tyler.getByTestId("ed-bed-save").click();
  await expect(tyler.getByTestId("ed-bed")).toHaveText("Fast 3");
  await expect(tyler.getByTestId("ed-stage")).toHaveText("Roomed");

  await page.getByTestId("ed-arrive").click();
  await page.getByTestId("arrive-new").click();
  await page.getByTestId("arrive-name").fill("Nora Quinn");
  await page.getByTestId("arrive-dob").fill("1987-05-14");
  await page.getByTestId("arrive-complaint").fill("Migraine");
  await page.getByTestId("arrive-esi").selectOption("3");
  await page.getByTestId("arrive-save").click();
  const nora = board.getByTestId("ed-row").filter({ hasText: "Nora Quinn" });
  await expect(nora).toContainText("Migraine");
  await nora.getByTestId("ed-lwbs").click();
  await expect(nora).toHaveCount(0);
  await expect(page.getByTestId("ed-kpis")).toContainText("Left without being seen1");

  const marcus = board.getByTestId("ed-row").filter({ hasText: "Marcus Hill" });
  await marcus.getByTestId("ed-pickup").click();
  await page.waitForURL("**/encounters/**");
  await consentAndSimulate(page);
  await draftNote(page);
  await expect(page.getByTestId("section-results")).toContainText("Troponin: <5 ng/L.");
  const course = page.getByTestId("section-course");
  await expect(course).toContainText("Initial results: The first ECG shows normal sinus rhythm");
  await expect(course).toContainText("Re-evaluation: After the aspirin, patient is pain free");
  await expect(page.getByTestId("section-dispo")).toContainText("Disposition: Observation.");
  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByRole("tab", { name: /Codes/ })).toContainText(/9928[345]/);
  await page.getByRole("tab", { name: "Note" }).click();
  await signNote(page);

  await page.goto("/ed");
  await expect(marcus.getByTestId("ed-suggested")).toHaveText("Heard: Observation");
  await expect(marcus.getByTestId("ed-note")).toContainText(/signed/i);
  await marcus.getByTestId("ed-admit").click();
  await page.getByTestId("ed-admit-unit").fill("Obs unit");
  await page.getByTestId("ed-admit-room").fill("O2");
  await page.getByTestId("ed-admit-save").click();
  await page.waitForURL("**/encounters/**");
  await expect(page.getByTestId("admission-chip")).toBeVisible();

  await page.goto("/ed");
  await expect(marcus.getByTestId("ed-stage")).toHaveText("Dispositioned: Observation");
  await marcus.getByTestId("ed-depart").click();
  await expect(marcus).toHaveCount(0);
  await page.goto("/hospital");
  await expect(page.getByTestId("census-row").filter({ hasText: "Marcus Hill" })).toContainText("Observation for chest pain");
});
