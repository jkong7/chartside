import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["clinician", "Your echo shows an ejection fraction of 30 percent."],
  ["patient", "I get short of breath after one flight of stairs, but no swelling."],
  ["clinician", "Your blood pressure is 118 over 72 and heart rate 70, potassium 4.4."],
  ["clinician", "Let's start dapagliflozin 10 milligrams daily for your heart failure."],
];

test("heart failure follow-up: four-pillar GDMT check in the note and the Quality tab", async ({ page }) => {
  await register(page);
  const { patient } = await (await page.request.post("/api/patients", { data: { name: "Victor Hale", dob: "1956-07-19", sex: "M", chart: { problems: [{ name: "Heart failure with reduced ejection fraction", icd10: "I50.22" }], medications: [{ name: "lisinopril", dose: "10 mg", frequency: "daily" }, { name: "metoprolol tartrate", dose: "25 mg", frequency: "twice daily" }], allergies: [], egfr: 58 } } })).json();
  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: patient.id, reason: "Heart failure follow-up", templateId: "cardiology_hf", visitType: "follow-up" } })).json();
  await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } });
  await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } });
  await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 30, tEnd: i * 30 + 20 })) } });
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  const sec = page.getByTestId("section-gdmt");
  await expect(sec).toContainText("HFrEF, LVEF 30%: 1 of 4 guideline-directed therapies at target dose.");
  await expect(sec).toContainText("Evidence-based beta blocker: not evidence-based (metoprolol tartrate 25 mg twice daily)");
  await page.getByRole("tab", { name: /Quality/ }).click();
  await expect(page.getByTestId("gdmt").getByTestId("gdmt-pillar")).toHaveCount(4);
  await expect(page.getByTestId("gdmt")).toContainText("Mineralocorticoid receptor antagonist");
});
