import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const SCRIPT = [
  ["clinician", "How's the knee been since Thursday?"],
  ["patient", "Better. Stairs are easier but it still gets stiff in the morning."],
  ["clinician", "Your knee flexion is 105 degrees today, and quad strength is 4 out of 5."],
  ["clinician", "We did 23 minutes of therapeutic exercise, then 12 minutes of manual therapy with joint mobilizations."],
  ["clinician", "Then 8 minutes of gait training on the stairs, and a cold pack at the end."],
];

test("physical therapy daily note: timed interventions, 8-minute-rule units with GP, no E/M", async ({ page }) => {
  await register(page);
  const { patients } = await (await page.request.get("/api/patients")).json();
  const james = patients.find((p: { name: string }) => p.name === "James Carter");
  const { encounter } = await (await page.request.post("/api/encounters", { data: { patientId: james.id, reason: "Knee rehab", templateId: "pt_daily", visitType: "follow-up" } })).json();
  expect((await page.request.post(`/api/encounters/${encounter.id}/consent`, { data: { decision: "granted", method: "verbal", state: "IL" } })).ok()).toBe(true);
  expect((await page.request.patch(`/api/encounters/${encounter.id}`, { data: { action: "start" } })).ok()).toBe(true);
  expect((await page.request.post(`/api/encounters/${encounter.id}/utterances`, { data: { utterances: SCRIPT.map(([speaker, text], i) => ({ speaker, text, tStart: i * 60, tEnd: i * 60 + 30 })) } })).ok()).toBe(true);
  await page.goto(`/encounters/${encounter.id}`);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
  const iv = page.getByTestId("section-interventions");
  await expect(iv).toContainText("Therapeutic exercise (97110): 23 minutes.");
  await expect(iv).toContainText("Total timed treatment: 43 minutes, 3 timed units under the 8-minute rule");
  await expect(page.getByTestId("section-measures")).toContainText("Knee flexion is 105 degrees");
  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByTestId("therapy-codes")).toContainText("modifier GP");
  await expect(page.getByTestId("therapy-codes")).toContainText("97140");
  await page.getByRole("tab", { name: /Billing/ }).click();
  await expect(page.getByText("97110").first()).toBeVisible();
  await expect(page.getByText(/9921[1-5]/)).toHaveCount(0);
});
