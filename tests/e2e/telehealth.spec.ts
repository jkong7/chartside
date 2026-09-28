import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("telehealth visit asks for the visit tab, falls back to the microphone, and records telehealth consent", async ({ page }) => {
  await register(page);
  const pats = (await (await page.request.get("/api/patients")).json()) as { patients: { id: string; name: string }[] };
  const p = pats.patients.find((x) => x.name === "James Carter")!;
  const created = await page.request.post("/api/encounters", { data: { patientId: p.id, visitType: "telehealth", setting: "telehealth", reason: "Video visit: cough" } });
  const id = ((await created.json()) as { encounter: { id: string } }).encounter.id;
  await page.goto(`/encounters/${id}`);
  await expect(page.getByTestId("telehealth-hint")).toContainText("share the video visit tab");
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await expect(page.getByText("Consent recorded")).toBeVisible();
  await page.getByTestId("start-mic").click();
  await expect(page.getByTestId("dual-channel")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("chunks-saved")).toContainText(/[1-9]\d* chunks? saved/, { timeout: 20_000 });
  const bundle = await (await page.request.get(`/api/encounters/${id}`)).json();
  expect(bundle.consent.statement).toContain("Telehealth visit; patient located in");
  expect(bundle.artifacts.capture.mode).toMatch(/single|dual/);
});
