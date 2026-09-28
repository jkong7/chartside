import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("imports an outside C-CDA, reconciles it into the chart, and shows it in the pre-visit brief", async ({ page }) => {
  await register(page);
  const pats = (await (await page.request.get("/api/patients")).json()) as { patients: { id: string; name: string }[] };
  const maria = pats.patients.find((p) => p.name === "Maria Gonzalez")!;
  await page.goto(`/patients/${maria.id}`);
  await page.getByTestId("records-file").setInputFiles("tests/fixtures/outside-ccd.xml");
  const rec = page.getByTestId("record");
  await expect(rec).toContainText(/ccda/i);
  await expect(rec.getByTestId("finding").filter({ hasText: "Paroxysmal atrial fibrillation" })).toContainText("New");
  await expect(rec.getByTestId("finding").filter({ hasText: "Penicillin" })).toContainText("New allergy");
  await expect(rec.getByTestId("finding").filter({ hasText: "Essential hypertension" })).toContainText("already in chart");
  await rec.getByTestId("finding").filter({ hasText: "TSH" }).locator("input").uncheck();
  await rec.getByTestId("records-accept").click();
  await expect(page.getByText("Paroxysmal atrial fibrillation").first()).toBeVisible();
  await expect(page.locator(".text-rec", { hasText: "penicillin" })).toBeVisible();

  await page.getByTestId("records-paste").click();
  await page.getByTestId("records-text").fill("Medications\nAtorvastatin 40 mg nightly\nLabs\nLDL 132 mg/dL 2026-09-01");
  await page.getByTestId("records-read").click();
  await expect(page.getByTestId("record").first()).toContainText("Was 20 mg at bedtime");

  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await expect(page.getByTestId("brief")).toContainText("Paroxysmal atrial fibrillation");
  await expect(page.getByTestId("brief").locator(".pill", { hasText: "outside" }).first()).toBeVisible();
});
