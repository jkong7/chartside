import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("full ambient visit: consent, live coverage, traceable note, codes, orders, sign, export", async ({ page }) => {
  await register(page);
  await openVisit(page, "Maria Gonzalez");

  await expect(page.getByTestId("start-simulate")).toBeDisabled();
  await expect(page.getByText("All-party consent state")).toBeVisible();
  await consentAndSimulate(page);

  await expect(page.getByTestId("coverage-score")).not.toHaveText("0%");
  await expect(page.getByTestId("coverage").getByText("Chief complaint: fatigue")).toBeVisible();
  await expect(page.getByTestId("coverage").getByText("E11.65")).toBeVisible();
  await expect(page.getByTestId("transcript").locator("[data-uid]")).toHaveCount(30);

  await draftNote(page);
  await expect(page.getByTestId("evidence-pct")).toContainText("% linked to the visit");
  const ap = page.getByTestId("section-assessment_plan");
  await expect(ap).toContainText("Type 2 diabetes mellitus with hyperglycemia (E11.65) — not at goal.");
  await expect(ap).toContainText("Increase lisinopril to 20 mg daily.");
  await expect(ap).toContainText("Patient verbalized understanding and agreement with the plan.");
  await expect(ap).not.toContainText("Patient questions addressed");

  await page.getByText("Increase lisinopril to 20 mg daily.").click();
  await expect(page.getByTestId("transcript").locator(".ring-1")).toContainText("increase the lisinopril to 20 milligrams");

  const omissions = page.getByTestId("omission");
  await expect(omissions).toHaveCount(1);
  await expect(omissions.first()).toContainText("Allergy to sulfa");
  await page.getByTestId("add-omission").click();
  await expect(page.getByTestId("omission-count")).toHaveText("0 possible omissions");
  await expect(page.getByTestId("section-subjective")).toContainText("Allergy: sulfa (hives).");

  await page.getByTestId("accept-default").first().click();
  await expect(page.getByTestId("section-objective")).toContainText("General: Alert, well-appearing");

  await page.getByTestId("section-objective").getByTestId("edit-section").click();
  const ta = page.getByTestId("section-textarea");
  await ta.fill((await ta.inputValue()) + "\nWeight stable per patient.");
  await page.getByTestId("save-section").click();
  await expect(page.getByTestId("section-objective")).toContainText("Weight stable per patient.");
  await page.reload();
  await expect(page.getByTestId("section-objective")).toContainText("Weight stable per patient.");
  await expect(page.getByTestId("section-objective")).toContainText("Vitals: BP 152/94 mmHg, HR 78 bpm.");

  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByTestId("em-code")).toHaveText("99214");
  await expect(page.getByTestId("dx-row")).toHaveCount(2);
  await expect(page.getByTestId("cdi")).toContainText("BMI 31.6");

  await page.getByTestId("sign").click();
  await expect(page.getByTestId("sign-blockers")).toContainText("still unreviewed");
  await page.getByRole("button", { name: "Review first" }).click();

  await page.getByRole("tab", { name: /Orders/ }).click();
  await page.getByTestId("accept-safe").click();
  await expect(page.locator("[data-testid=order-row][data-status=staged]")).toHaveCount(0);

  await page.getByRole("tab", { name: "Letters" }).click();
  await expect(page.getByTestId("letters-panel")).toContainText("Referral to: Diabetes education");

  await page.getByRole("tab", { name: "Note" }).click();
  await page.getByTestId("sign").click();
  await expect(page.locator("[data-status=signed]").first()).toBeVisible();
  await expect(page.getByTestId("consent-line")).toContainText("Verbal consent for AI-assisted documentation");
  await expect(page.getByTestId("sign")).toHaveCount(0);

  const res = await page.request.get(page.url().replace("/encounters/", "/api/encounters/") + "/export?format=fhir");
  const bundle = await res.json();
  expect(bundle.resourceType).toBe("Bundle");
  const types = bundle.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType);
  expect(types).toEqual(expect.arrayContaining(["Composition", "DocumentReference", "Condition", "MedicationRequest", "ServiceRequest"]));
  expect(bundle.entry[0].resource.status).toBe("final");

  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByTestId("audit-panel")).toContainText("Note signed");
  await expect(page.getByTestId("audit-panel")).toContainText("Consent recorded");

  await page.goto("/today");
  await expect(page.getByTestId("today-summary")).toContainText("1 signed");
});

test("redacting a transcript line and redrafting removes it from the note", async ({ page }) => {
  await register(page);
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await draftNote(page);
  await expect(page.getByTestId("section-subjective")).toContainText("Sick contacts");
  const uid = await page.getByTestId("transcript").locator("[data-uid]").filter({ hasText: "My kids had the same thing" }).getAttribute("data-uid");
  const line = page.locator(`[data-uid="${uid}"]`);
  await line.hover();
  await line.getByRole("button", { name: "Redact utterance" }).click();
  await expect(line).toContainText("Redacted by clinician");
  await page.getByTestId("redraft").click();
  await expect(page.getByTestId("section-subjective")).not.toContainText("Sick contacts", { timeout: 30_000 });
});
