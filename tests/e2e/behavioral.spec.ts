import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register, signNote } from "./helpers";

test("psychotherapy session: risk assessment, interventions, time-based code, restricted note", async ({ page, browser }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Jordan Reyes" }).click();
  await consentAndSimulate(page);
  await draftNote(page);
  const encId = page.url().split("/encounters/")[1].split("?")[0];
  await page.request.patch(`/api/encounters/${encId}`, { data: { durationS: 3000 } });
  await page.getByTestId("detail-concise").click();
  await expect(page.getByTestId("detail-concise")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("detail-standard").click();
  await expect(page.getByTestId("detail-standard")).toHaveAttribute("aria-checked", "true");

  const risk = page.getByTestId("section-risk");
  await expect(risk).toContainText("Suicidal ideation: passive");
  await expect(risk).toContainText("Plan: denies.");
  await expect(risk).toContainText("Access to lethal means: means restricted");
  await expect(risk).toContainText("Protective factors: daughter");
  await expect(risk).toContainText("Safety plan reviewed");
  await expect(page.getByTestId("section-interventions")).toContainText("Cognitive restructuring (CBT).");
  await expect(page.getByTestId("section-response")).toContainText("Engaged and receptive");
  await expect(page.getByTestId("section-time")).toContainText("Psychotherapy time: 50 minutes face to face (supports 90834).");
  await expect(page.getByRole("tab", { name: /Codes/ })).toContainText("90834");

  await page.getByTestId("sign").click();
  await expect(page.getByTestId("sign-blockers")).toContainText("*** blanks");
  await page.getByRole("button", { name: "Review first" }).click();
  await risk.getByTestId("edit-section").click();
  const area = risk.getByTestId("section-textarea");
  await area.fill((await area.inputValue()).replace(" ***", " Outpatient care remains appropriate."));
  await risk.getByTestId("save-section").click();
  await expect(risk).toContainText("low acute risk. Outpatient care remains appropriate.");
  await signNote(page);

  const fhir = await (await page.request.get(`/api/encounters/${encId}/export?format=fhir`)).json();
  expect(fhir.entry[0].resource.meta.security[0].code).toBe("R");
  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await page.getByTestId("share").click();
  const href = (await page.getByTestId("share-link").getAttribute("href"))!;
  const ctx = await browser.newContext();
  const patient = await ctx.newPage();
  await patient.goto(href);
  await expect(patient.getByTestId("share-summary")).toBeVisible();
  const share = await (await patient.request.get(`/api/share/${href.split("/s/")[1]}`)).json();
  expect(share.transcript).toEqual([]);
  await ctx.close();

  await page.goto("/patients");
  await page.getByRole("link", { name: /Jordan Reyes/ }).first().click();
  await page.getByTestId("access-report").click();
  await page.waitForURL("**/access");
  const rows = page.getByTestId("access-events");
  await expect(rows).toContainText("Viewed the visit");
  await expect(rows).toContainText("Signed the note");
  await expect(rows).toContainText("Exported the note as FHIR");
});
