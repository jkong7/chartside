import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["clinician", "How are you feeling? Any bleeding, leaking of fluid, or contractions?"],
  ["patient", "No, none of that."],
  ["clinician", "And is the baby moving a lot?"],
  ["patient", "Yes, kicking all the time, especially at night."],
  ["patient", "I've had a headache the last two days that Tylenol isn't touching."],
  ["clinician", "Your blood pressure is 144 over 92. Your urine shows trace protein."],
  ["clinician", "You're measuring 31 centimeters, and the baby's heart rate is 145."],
];

test("prenatal visit: pregnancy on the chart, warning signs, preeclampsia flag, due items, global OB billing", async ({ page }) => {
  await register(page);
  const { patient } = await (await page.request.post("/api/patients", { data: { name: "Grace Lin", dob: "1995-03-02", sex: "F" } })).json();
  await page.goto(`/patients/${patient.id}`);
  const card = page.getByTestId("pregnancy-card");
  await card.getByTestId("pregnancy-edit").click();
  const today = new Date();
  const edd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 84, 12);
  const iso = `${edd.getFullYear()}-${String(edd.getMonth() + 1).padStart(2, "0")}-${String(edd.getDate()).padStart(2, "0")}`;
  await card.getByTestId("pregnancy-edd").fill(iso);
  await card.getByTestId("pregnancy-gravida").fill("2");
  await card.getByTestId("pregnancy-rh").selectOption("negative");
  await card.getByTestId("pregnancy-save").click();
  await expect(card.getByTestId("pregnancy-ga")).toContainText("28 weeks 0 days");

  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: patient.id, reason: "Prenatal visit", templateId: "ob_prenatal", visitType: "follow-up" } })).json();
  await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } });
  await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } });
  await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 30, tEnd: i * 30 + 20 })) } });
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("section-pregnancy")).toContainText("G2P0 at 28 weeks 0 days by EDD");
  await expect(page.getByTestId("section-warning")).toContainText("Reports active fetal movement; denies vaginal bleeding, leakage of fluid, contractions.");
  await expect(page.getByTestId("section-obexam")).toContainText("Fundal height: 31 cm.");
  const due = page.getByTestId("section-due");
  await expect(due).toContainText("Flag: BP 144/92 is in the hypertensive range");
  await expect(due).toContainText("Rh-negative: antibody screen and Rh immune globulin at 28 weeks.");
  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByTestId("codes-panel")).toContainText("Z34.83");
  await expect(page.getByTestId("codes-panel")).toContainText("Z3A.28");
  await page.getByRole("tab", { name: /Billing/ }).click();
  await expect(page.getByTestId("billing-panel")).toContainText("0502F");
});
