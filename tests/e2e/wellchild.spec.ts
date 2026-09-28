import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["clinician", "Mom filled out the ASQ and the M-CHAT in the waiting room, and both look reassuring."],
  ["clinician", "We'll do fluoride varnish on her teeth today."],
  ["clinician", "Keep her rear-facing in the car seat as long as the seat allows, and keep reading books together."],
];

test("well-child visit at 18 months: screenings, immunizations due, guidance, and preventive billing", async ({ page }) => {
  await register(page);
  const dob = new Date();
  dob.setMonth(dob.getMonth() - 18);
  dob.setDate(dob.getDate() - 3);
  const iso = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`;
  const { patient } = await (await page.request.post("/api/patients", { data: { name: "Lily Chen", dob: iso, sex: "F", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicaid" }, immunizations: [{ name: "DTaP", date: iso }] } } })).json();
  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: patient.id, reason: "18 month well visit", templateId: "peds_well", visitType: "annual" } })).json();
  await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } });
  await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } });
  await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 30, tEnd: i * 30 + 20 })) } });
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("section-screens")).toContainText("Autism screen (M-CHAT-R/F): completed (96110).");
  await expect(page.getByTestId("section-imms")).toContainText("Due: ");
  await expect(page.getByTestId("section-guidance")).toContainText("Discussed: Rear-facing car seat");
  await page.getByRole("tab", { name: /Billing/ }).click();
  const billing = page.getByTestId("billing-panel");
  await expect(billing).toContainText("99382");
  await expect(billing).toContainText("99188");
  await expect(billing).toContainText("Z00.129");
});
