import { expect, test } from "@playwright/test";
import { draftNote, register } from "./helpers";

const ISS = "http://localhost:3297/fhir";

async function stats(page: import("@playwright/test").Page) {
  return (await (await page.request.get("http://localhost:3297/stats")).json()) as { docs: { id: string; text: string }[]; token: number };
}

test("Epic EHR launch: sign in, import chart and encounter, document, sign, and file the note back", async ({ page }) => {
  const before = (await stats(page)).docs.length;
  await page.goto(`/smart/launch?iss=${encodeURIComponent(ISS)}&launch=epic-launch-123`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByText("Sign in to continue launching Chartside from your EHR.")).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.fill("#name", "Dr. Avery Chen");
  await page.fill("#email", `ehr-${Date.now()}@chartside.test`);
  await page.fill("#password", "correct-horse-9");
  await page.click("button[type=submit]");

  await expect(page).toHaveURL(/\/encounters\/enc_/, { timeout: 30_000 });
  await expect(page.getByTestId("patient-name")).toHaveText("Elena Vasquez");
  await expect(page.getByTestId("ehr-chip")).toHaveText("Epic · encounter linked");
  const brief = page.getByTestId("brief");
  await expect(brief).toContainText("Type 2 diabetes mellitus");
  await expect(brief).toContainText("E11.9");
  await expect(brief).toContainText("metformin 1,000 mg tablet");
  await expect(brief).toContainText("penicillin · hives");
  await expect(brief).toContainText("Hemoglobin A1c 8.1 %");
  await expect(page.getByLabel("Patient summary language")).toHaveValue("es");

  await page.getByRole("button", { name: "Patient agreed" }).click();
  await page.getByTestId("start-type").click();
  await page.getByText("Paste a whole transcript").click();
  await page.getByTestId("paste-input").fill(
    [
      "Dr: Your A1c came back at 8.1, so your diabetes is not at goal.",
      "Patient: I have been skipping the evening metformin because it upsets my stomach.",
      "Dr: Your blood pressure is 148 over 92 today.",
      "Dr: Let's increase lisinopril to 40 milligrams daily and keep the metformin twice a day with meals.",
      "Dr: Follow up in 3 months. Any questions?",
    ].join("\n"),
  );
  await page.getByTestId("paste-add").click();
  await draftNote(page);
  await expect(page.getByTestId("section-assessment_plan")).toContainText("Increase lisinopril to 40 mg daily.");

  await page.getByRole("tab", { name: /Orders/ }).click();
  for (const b of await page.getByTestId("accept-order").all()) await b.click();
  await page.getByRole("tab", { name: "Note" }).click();
  await page.getByTestId("sign").click();
  const anyway = page.getByTestId("sign-anyway");
  await expect(anyway.or(page.getByTestId("ehr-filed"))).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(page.getByTestId("ehr-filed")).toHaveText("Filed to Epic");

  const s = await stats(page);
  expect(s.docs.length).toBe(before + 1);
  const doc = s.docs.at(-1)!;
  expect(doc.text).toContain("Increase lisinopril to 40 mg daily.");
  expect(doc.text).toContain("Signed electronically by Dr. Avery Chen");
  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByTestId("audit-panel")).toContainText("Launched from the EHR with patient and encounter context");
  await expect(page.getByTestId("audit-panel")).toContainText("Signed note filed to the EHR");
});

test("standalone connect from settings links the patient, resyncs, and explains why a note without an encounter cannot be filed", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await expect(page.getByTestId("ehr-settings")).toContainText("Client charts…");
  await page.getByTestId("ehr-connect").click();
  await expect(page).toHaveURL(/\/encounters\/enc_/, { timeout: 30_000 });
  await expect(page.getByTestId("ehr-chip")).toHaveText("Epic · patient linked");

  await page.getByRole("button", { name: "Patient agreed" }).click();
  await page.getByTestId("start-type").click();
  await page.getByTestId("type-input").fill("Your A1c is 8.1 so the diabetes is not at goal. Follow up in 3 months.");
  await page.keyboard.press("Enter");
  await draftNote(page);
  await page.getByTestId("sign").click();
  const anyway = page.getByTestId("sign-anyway");
  await expect(anyway.or(page.getByTestId("ehr-retry"))).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(page.getByTestId("ehr-retry")).toBeVisible();
  await expect(page.getByTestId("ehr-retry")).toHaveAttribute("title", /did not provide an encounter/);

  await page.goto("/settings");
  await expect(page.getByTestId("ehr-connection")).toContainText("Patient/eX7tQ2pVh9Lw");
  await page.goto("/patients");
  await page.getByText("Elena Vasquez").click();
  await expect(page.getByTestId("ehr-linked")).toHaveText("Linked to Epic");
  await page.getByTestId("ehr-resync").click();
  await expect(page.getByRole("status")).toHaveText("Chart updated");
});

test("launches from an unknown EHR are refused", async ({ page }) => {
  await register(page);
  await page.goto(`/smart/launch?iss=${encodeURIComponent("https://evil.example.com/fhir")}&launch=abc`);
  await expect(page).toHaveURL(/\/settings\?ehr_error=/);
  await expect(page.getByTestId("ehr-error")).toContainText("is not on the allowed list");
});
