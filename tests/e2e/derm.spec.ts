import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["patient", "This mole on my back has gotten bigger over the summer."],
  ["clinician", "There's a 7 mm dark brown macule with irregular borders on the left upper back."],
  ["clinician", "The risks of a biopsy are bleeding, infection, and a small scar. Is it okay to go ahead?"],
  ["patient", "Yes, go ahead."],
  ["clinician", "I took a shave biopsy of the lesion on the left upper back. Minimal bleeding, hemostasis achieved."],
];

test("dermatology visit: lesion description with ABCDE flags and a shave biopsy procedure note", async ({ page }) => {
  await register(page);
  const { patients } = await (await page.request.get("/api/patients")).json();
  const pt = patients.find((p: { name: string }) => p.name === "Priya Shah");
  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: pt.id, reason: "Changing mole", templateId: "derm_visit", visitType: "follow-up" } })).json();
  await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } });
  await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } });
  await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 30, tEnd: i * 30 + 20 })) } });
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("section-skin")).toContainText("7 mm dark brown macule with irregular borders on the left upper back. Concerning features: irregular border, diameter over 6 mm");
  await expect(page.getByTestId("section-procedure")).toContainText("Tangential (shave) biopsy of skin, single lesion");
  await page.getByRole("tab", { name: /Billing/ }).click();
  await expect(page.getByTestId("billing-panel")).toContainText("11102");
});
