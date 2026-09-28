import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["clinician", "I reviewed the health risk assessment you filled out. Any new diagnoses or surgeries since last year?"],
  ["patient", "No, nothing new."],
  ["clinician", "Your blood pressure is 128 over 76 and your weight is 150 pounds."],
  ["clinician", "Let's do a quick memory check. I'll say three words and ask you to recall them."],
  ["clinician", "Over the past two weeks, have you felt down, depressed, or hopeless? Your PHQ-2 is 0."],
  ["clinician", "Any falls this year, and do you have grab bars in the bathroom?"],
  ["clinician", "You're due for a colonoscopy this year, and let's keep walking 30 minutes a day."],
  ["clinician", "We spent 20 minutes on advance care planning; your daughter is your health care power of attorney."],
];

test("annual wellness visit: elements checklist, screening schedule, ACP time, and Medicare codes", async ({ page }) => {
  await register(page);
  const { patient } = await (await page.request.post("/api/patients", { data: { name: "Helen Ortiz", dob: "1956-02-10", sex: "F", chart: { problems: [{ name: "Essential hypertension", icd10: "I10" }], medications: [], allergies: [], coverage: { payer: "Medicare" }, priorVisits: [{ date: "2025-09-20", summary: "Annual wellness visit (G0438).", plan: [] }] } } })).json();
  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: patient.id, reason: "Annual wellness visit", templateId: "awv", visitType: "annual" } })).json();
  await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } });
  await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } });
  await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 30, tEnd: i * 30 + 20 })) } });
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("section-awv")).toContainText("Subsequent annual wellness visit (G0439): 8 of 9 required elements documented.");
  await expect(page.getByTestId("section-awv")).toContainText("Current providers and suppliers listed: ***");
  await expect(page.getByTestId("section-schedule")).toContainText("Osteoporosis screening (DEXA): due");
  await expect(page.getByTestId("section-acp")).toContainText("20 minutes (supports 99497 with modifier 33)");
  await page.getByRole("tab", { name: /Billing/ }).click();
  const billing = page.getByTestId("billing-panel");
  await expect(billing).toContainText("G0439");
  await expect(billing).toContainText("G0444");
  await expect(billing).toContainText("99497");
});
