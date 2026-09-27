import { expect, type Page } from "@playwright/test";

export async function register(page: Page, name = "Dr. Avery Chen") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@chartside.test`;
  await page.goto("/register");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", "correct-horse-9");
  await page.click("button[type=submit]");
  await page.waitForURL("**/today");
  return email;
}

export async function openVisit(page: Page, patient: string) {
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: patient }).click();
  await expect(page.getByTestId("consent-card")).toBeVisible();
}

export async function consentAndSimulate(page: Page) {
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await expect(page.getByText("Consent recorded")).toBeVisible();
  await page.getByTestId("start-simulate").click();
  await page.getByLabel("Playback speed").selectOption("10");
  await expect(page.getByTestId("sim-done")).toBeVisible({ timeout: 60_000 });
}

export async function draftNote(page: Page) {
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
}
