import { expect, test, type Browser } from "@playwright/test";
import { consentAndSimulate, draftNote, register, signNote } from "./helpers";

const uniq = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

async function fresh(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

test("a resident's note goes to the attending, who returns it, then co-signs with a teaching attestation", async ({ page, browser }) => {
  await register(page, "Dr. Ada Attending");
  await page.goto("/admin");
  const owner = page.getByTestId("member-row").filter({ hasText: "Dr. Ada Attending" });
  await owner.getByTestId("member-credential").selectOption("MD");
  await expect(page.getByText("credential was updated")).toBeVisible();

  const email = `resident-${uniq()}@chartside.test`;
  await page.fill("#invite-email", email);
  await page.selectOption("#invite-role", "clinician");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!;

  const r = await fresh(browser);
  await r.page.goto(link);
  await r.page.fill("#name", "Dr. Rex Resident");
  await r.page.fill("#password", "correct-horse-9");
  await r.page.click("button[type=submit]");
  await r.page.waitForURL("**/today");

  await page.reload();
  const row = page.getByTestId("member-row").filter({ hasText: "Dr. Rex Resident" });
  await row.getByTestId("member-credential").selectOption("Resident");
  await expect(row.getByTestId("member-supervisor")).toBeVisible();
  await row.getByTestId("member-supervisor").selectOption({ label: "Supervisor: Dr. Ada Attending" });
  await expect(page.getByText("now go to Dr. Ada Attending for co-signature")).toBeVisible();

  const pats = (await (await page.request.get("/api/patients")).json()) as { patients: { id: string; name: string }[] };
  const maria = pats.patients.find((p) => p.name === "Maria Gonzalez")!;
  const members = (await (await page.request.get("/api/admin")).json()) as { members: { userId: string; name: string }[] };
  const resident = members.members.find((m) => m.name === "Dr. Rex Resident")!;
  const created = await page.request.post("/api/encounters", { data: { patientId: maria.id, clinicianId: resident.userId, reason: "Knee pain follow-up", templateId: "soap" } });
  const encId = ((await created.json()) as { encounter: { id: string } }).encounter.id;

  await r.page.goto(`/encounters/${encId}`);
  await consentAndSimulate(r.page);
  await draftNote(r.page);
  await signNote(r.page);
  await expect(r.page.getByTestId("cosign-pending")).toContainText("Awaiting co-signature from Dr. Ada Attending");
  await expect(r.page.getByTestId("signature-line")).toContainText("Dr. Rex Resident, Resident");

  await page.goto(`/encounters/${encId}`);
  await expect(page.getByTestId("cosign-panel")).toContainText("Dr. Rex Resident (Resident) signed this note");
  await page.getByTestId("cosign-return").click();
  await page.getByTestId("cosign-comment").fill("Add the knee exam findings.");
  await page.getByTestId("cosign-return-confirm").click();
  await expect(page.getByText("Returned to Dr. Rex Resident for changes.")).toBeVisible();

  await r.page.reload();
  await expect(r.page.getByTestId("cosign-returned")).toContainText("Add the knee exam findings.");
  await signNote(r.page);
  await expect(r.page.getByTestId("cosign-pending")).toBeVisible();

  await page.reload();
  await page.getByText("Saw and evaluated the patient", { exact: true }).click();
  await page.getByTestId("cosign-submit").click();
  await expect(page.getByTestId("cosign-done")).toContainText("Co-signed by Dr. Ada Attending");
  await expect(page.getByTestId("cosign-done")).toContainText("modifier GC");
  await expect(page.getByTestId("addendum").first()).toContainText("I, Dr. Ada Attending, saw and evaluated the patient");
  await expect(page.getByTestId("chain-ok")).toBeVisible();

  await page.getByRole("tab", { name: "Billing" }).click();
  await expect(page.getByText("GC").first()).toBeVisible();
  await r.ctx.close();
});

test("a clinician adds an addendum and a correction to a signed note without changing it", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);
  await signNote(page);
  await expect(page.getByTestId("signature-line")).toBeVisible();
  await expect(page.getByTestId("chain-ok")).toBeVisible();

  await page.getByTestId("add-addendum").click();
  await page.getByTestId("addendum-text").fill("A1c resulted at 7.4% after the visit; continue current plan.");
  await page.getByTestId("addendum-save").click();
  await expect(page.getByText("Addendum added and signed.")).toBeVisible();

  await page.getByTestId("add-addendum").click();
  await page.getByTestId("addendum-kind-correction").click();
  await page.getByTestId("addendum-text").fill("Metformin dose is 1000 mg twice daily.");
  await expect(page.getByTestId("addendum-save")).toBeEnabled();
  await page.getByTestId("addendum-save").click();
  await expect(page.getByText("A correction needs a reason")).toBeVisible();
  await page.getByTestId("addendum-reason").fill("Dose misheard");
  await page.getByTestId("addendum-save").click();
  await expect(page.getByTestId("addendum")).toHaveCount(2);
  await expect(page.getByTestId("addendum").nth(1)).toContainText("Reason: Dose misheard");

  const encId = page.url().split("/encounters/")[1].split("?")[0];
  const { text } = (await (await page.request.get(`/api/encounters/${encId}/export`)).json()) as { text: string };
  expect(text).toContain("ADDENDUM · Dr. Avery Chen");
  expect(text).toContain("CORRECTION · Dr. Avery Chen");
});
