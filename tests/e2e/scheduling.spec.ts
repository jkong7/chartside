import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("imports tomorrow's schedule and books follow-ups from the queue", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("open-import").click();
  const t = new Date(Date.now() + 86400000);
  const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const dialog = page.getByTestId("import-schedule");
  await dialog.getByLabel("Clinic date").fill(date);
  await page.getByTestId("import-text").fill("8:30 AM   Maria Gonzalez   03/14/1968   MRN 100482   Follow-up: diabetes\n9:15 AM   Lee, Dana   02/03/1990   Telehealth - back pain\n10:00 AM   Oscar Diaz   Annual physical");
  await page.getByTestId("import-preview-btn").click();
  const rows = page.getByTestId("import-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Matched by MRN");
  await expect(rows.nth(1)).toContainText("New patient");
  await expect(rows.nth(2)).toContainText("New patient needs a date of birth");
  await page.getByTestId("import-commit").click();
  await expect(page.getByTestId("import-done")).toHaveText("Added 2 visits and 1 new patient. Skipped 1.");
  const api = await (await page.request.get(`/api/encounters?from=${new Date(`${date}T00:00:00`).toISOString()}&to=${new Date(`${date}T23:59:59`).toISOString()}`)).json();
  expect(api.encounters.map((e: { patient: { name: string } }) => e.patient.name).sort()).toEqual(["Dana Lee", "Maria Gonzalez"]);
  expect(api.encounters.find((e: { patient: { name: string } }) => e.patient.name === "Dana Lee").setting).toBe("telehealth");

  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByTestId("nav").getByRole("link", { name: "Scheduling" }).click();
  await page.waitForURL("**/scheduling");
  const queue = page.getByTestId("follow-up-row");
  const before = await queue.count();
  expect(before).toBeGreaterThan(0);
  const next = new Date(Date.now() + 14 * 86400000);
  await queue.first().getByTestId("follow-up-when").fill(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}T10:30`);
  await queue.first().getByTestId("book").click();
  await expect(page.getByTestId("booked")).toContainText("Booked");
  await expect(queue).toHaveCount(before - 1);
  const ics = await page.request.get((await page.getByTestId("ics").getAttribute("href"))!);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VEVENT");
});
