import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register, signNote } from "../helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");

test("the home page only points at the line and sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-sample")).toBeVisible();
  await expect(page.getByTestId("home-practice")).toHaveCount(0);
  await expect(page.getByTestId("home-visit")).toHaveCount(0);
});

test("hidden areas redirect to visits and hidden APIs answer 404", async ({ page }) => {
  await register(page, "Dr. Core Gate");
  for (const path of ["/hospital", "/revenue", "/templates", "/inbox", "/practice", "/visit", "/barn"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/today$/);
  }
  for (const path of ["/api/claims", "/api/v1/notes", "/api/inbox/count", "/api/admin/sso"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
});

test("the nav shows only the slice", async ({ page }) => {
  await register(page, "Dr. Core Nav");
  const labels = (await page.getByTestId("nav").locator("a").allInnerTexts()).map((t) => t.trim());
  expect(labels).toEqual(["Visits", "Record", "To review", "Patients", "Admin", "Settings"]);
  await expect(page.getByTestId("show-all-tools")).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("tab")).toHaveText(["Members", "Security", "Line", "Audit log", "Organization"]);
});

test("a recorded visit drafts a SOAP note that is edited and signed with nothing else on screen", async ({ page }) => {
  await register(page, "Dr. Core Note");
  await openVisit(page, "James Carter");
  await expect(page.locator("#tpl")).toHaveCount(0);
  await consentAndSimulate(page);
  await draftNote(page);
  await expect(page.getByTestId("note-editor").locator("h3")).toHaveText(["Subjective", "Objective", "Assessment & Plan"]);
  await expect(page.getByRole("tab", { name: "Codes" })).toHaveCount(0);
  await expect(page.getByTestId("fhir")).toHaveCount(0);
  await expect(page.getByLabel("Template")).toHaveCount(0);
  await expect(page.getByTestId("open-calculators")).toHaveCount(0);
  await expect(page.getByTestId("copy-note")).toBeVisible();
  await signNote(page);
});

test("a call's recording lands in To review as a SOAP note and signs there", async ({ page }) => {
  await register(page, "Dr. Core Stack");
  const r = await page.request.post("/api/capture?consent=granted&state=IL&durationS=22&reason=Cough", { headers: { "content-type": "audio/wav" }, data: wav });
  expect(r.status()).toBe(202);
  const { encounterId, statusUrl } = await r.json();
  await expect.poll(async () => (await (await page.request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  const bundle = await (await page.request.get(`/api/encounters/${encounterId}`)).json();
  expect(bundle.note.content.sections.filter((s: { key: string }) => s.key !== "__consent").map((s: { key: string }) => s.key)).toEqual(["subjective", "objective", "assessment_plan"]);
  const kinds = new Set(((await (await page.request.get("/api/decisions")).json()).decisions as { kind: string }[]).map((d) => d.kind));
  for (const k of kinds) expect(["note.sign", "note.cosign", "patient.match", "proposal"]).toContain(k);
  await page.goto(`/go/stack?focus=${encounterId}`);
  await expect(page.getByTestId("stack-card")).toHaveAttribute("data-kind", "note.sign");
  await page.getByTestId("stack-approve").click();
  const force = page.getByTestId("stack-force");
  await expect(page.getByTestId("stack-toast").or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("Signed");
});

test("the phone line never offers practice mode", async ({ page }) => {
  await page.goto("/go/phone");
  await page.getByTestId("sim-call").click();
  await expect(page.getByTestId("sim-incall")).toHaveAttribute("data-state", "consent", { timeout: 15000 });
  await expect(page.getByTestId("sim-caption")).not.toContainText(/practice/i);
});
