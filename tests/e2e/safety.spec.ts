import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("pediatric visit: allergy block, Spanish summary, and the patient correction loop", async ({ page, browser }) => {
  await register(page);
  await openVisit(page, "Sofia Ramirez");
  await consentAndSimulate(page);
  await draftNote(page);

  await expect(page.getByTestId("section-subjective")).toContainText("History provided by parent.");
  await expect(page.getByTestId("section-assessment_plan")).toContainText("Amoxicillin avoided due to documented penicillin allergy.");

  await page.getByRole("tab", { name: /Orders/ }).click();
  const amox = page.getByTestId("order-row").filter({ hasText: "Start amoxicillin" });
  await expect(amox).toHaveAttribute("data-status", "rejected");
  await expect(amox.getByTestId("alert-block")).toContainText("allergic to penicillin");
  const azi = page.getByTestId("order-row").filter({ hasText: "Start azithromycin" });
  await expect(azi.getByTestId("alert-warn")).toContainText("weight-based dose");

  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByTestId("summary-panel")).toContainText("Creemos que tiene una infección de oído.");
  await page.getByTestId("share").click();
  const href = await page.getByTestId("share-link").getAttribute("href");
  expect(href).toMatch(/^\/s\/[a-f0-9]{32}$/);

  const patientCtx = await browser.newContext();
  const patient = await patientCtx.newPage();
  await patient.goto(href!);
  await expect(patient.getByTestId("share-summary")).toContainText("Gracias por venir hoy, Sofia.");
  await patient.getByTestId("flag-item").first().click();
  await patient.getByTestId("flag-comment").fill("El doctor dijo oído derecho, no izquierdo.");
  await patient.getByTestId("flag-send").click();
  await expect(patient.getByRole("status")).toContainText("Su equipo de atención lo revisará");
  await patientCtx.close();

  await page.reload();
  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await expect(page.getByTestId("patient-flags")).toContainText("El doctor dijo oído derecho");
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);
});

test("all-party consent requires confirmation when others are present, and declined consent blocks ambient capture", async ({ page }) => {
  await register(page);
  await openVisit(page, "Daniel Kim");
  await page.getByLabel("Others present (family, interpreter, trainee)").check();
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await expect(page.getByTestId("consent-card").getByRole("alert")).toContainText("requires every person in the room to consent");

  await openVisit(page, "Priya Shah");
  await page.getByRole("button", { name: "Declined" }).click();
  await expect(page.getByText("Patient declined").first()).toBeVisible();
  await expect(page.getByTestId("start-mic")).toBeDisabled();
  await expect(page.getByTestId("start-simulate")).toBeDisabled();
  await page.getByTestId("start-type").click();
  await page.getByTestId("type-input").fill("Patient here for low back pain for two weeks after lifting boxes.");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("transcript")).toContainText("low back pain");
});
