import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["patient", "My right knee has been really painful for three months, worse on stairs."],
  ["clinician", "Your x-ray shows moderate osteoarthritis of the right knee."],
  ["clinician", "The risks are infection, bleeding, and a short flare of pain. Is it okay to go ahead with the injection?"],
  ["patient", "Yes, let's do it."],
  ["clinician", "Time out, right knee confirmed. I cleaned the site with chlorhexidine."],
  ["clinician", "I injected 40 milligrams of Kenalog with 3 mL of lidocaine into the right knee."],
  ["clinician", "You tolerated it well with no complications. Let's refill your meloxicam 15 milligrams daily for the knee osteoarthritis."],
];

test("office procedure: knee injection documented with consent, J-code units, RT, and modifier 25", async ({ page }) => {
  await register(page);
  const { patients } = await (await page.request.get("/api/patients")).json();
  const pt = patients.find((p: { name: string }) => p.name === "Maria Gonzalez");
  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: pt.id, reason: "Right knee pain", visitType: "follow-up" } })).json();
  await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } });
  await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } });
  await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 30, tEnd: i * 30 + 20 })) } });
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  const proc = page.getByTestId("section-procedure");
  await expect(proc).toContainText("right knee (20610)");
  await expect(proc).toContainText("Consent: risks including bleeding, infection, and pain were discussed");
  await expect(proc).toContainText("Triamcinolone acetonide 40 mg (J3301 x4)");
  await page.getByRole("tab", { name: /Billing/ }).click();
  const billing = page.getByTestId("billing-panel");
  await expect(billing).toContainText("20610");
  await expect(billing).toContainText("J3301");
  await expect(billing).toContainText("RT");
  await expect(billing).toContainText("25");
});
