import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("microphone visit: live diarized captions, chunked upload with offline buffering, post-visit re-transcription, playback, retention", async ({ page, context }) => {
  await register(page);
  await openVisit(page, "James Carter");
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await page.getByTestId("start-mic").click();

  await expect(page.getByTestId("recording-health")).toBeVisible();
  await expect(page.getByTestId("live-status")).toHaveText("Live captions: Deepgram (speaker-separated)");
  const lines = page.getByTestId("transcript").locator("[data-uid]");
  await expect(lines).toHaveCount(4, { timeout: 20_000 });
  await expect(lines.nth(0)).toContainText("Clinician");
  await expect(lines.nth(1)).toContainText("Patient");
  await expect(lines.nth(1)).toContainText("dry cough for about five days");
  await expect(page.getByTestId("coverage").getByText("Chief complaint: cough")).toBeVisible();
  await expect(page.getByTestId("chunks-saved")).toContainText(/[1-9]\d* chunks? saved/, { timeout: 15_000 });

  await context.setOffline(true);
  await expect(page.getByTestId("recording-health")).toContainText("Offline: audio is buffered on this device");
  await expect(page.getByTestId("chunks-saved")).toContainText("waiting to upload", { timeout: 15_000 });
  await context.setOffline(false);
  await expect(page.getByTestId("chunks-saved")).not.toContainText("waiting to upload", { timeout: 20_000 });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("resume")).toBeVisible();
  await page.getByTestId("resume").click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await draftNote(page);
  await expect(page.getByTestId("transcript").locator("[data-uid]")).toHaveCount(6);
  await expect(page.getByTestId("section-subjective")).toContainText("dry cough for 5 days");
  await expect(page.getByTestId("section-subjective")).toContainText("denies");
  await expect(page.getByTestId("section-assessment_plan")).toContainText("Acute upper respiratory infection (J06.9)");
  await expect(page.getByTestId("play-line").first()).toBeVisible();

  const audioUrl = page.url().replace("/encounters/", "/api/encounters/") + "/audio";
  const audio = await page.request.get(audioUrl);
  expect(audio.status()).toBe(200);
  expect(audio.headers()["content-type"]).toMatch(/^audio\//);
  expect((await audio.body()).length).toBeGreaterThan(5000);
  const ranged = await page.request.get(audioUrl, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);

  await page.getByText("Acute upper respiratory infection (J06.9)").click();
  await expect(page.getByTestId("play-evidence")).toBeVisible();
  await page.getByTestId("play-evidence").click();

  const stats = await (await page.request.get("http://localhost:3299/stats")).json();
  expect(stats.wsConnections).toBeGreaterThan(0);
  expect(stats.wsAudioMessages).toBeGreaterThan(0);
  expect(stats.prerecorded).toBeGreaterThan(0);

  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByTestId("audit-panel")).toContainText("Full recording re-transcribed with speaker separation");

  await page.getByRole("tab", { name: "Note" }).click();
  await page.getByTestId("sign").click();
  const anyway = page.getByTestId("sign-anyway");
  await expect(anyway.or(page.locator("[data-status=signed]").first())).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(page.locator("[data-status=signed]").first()).toBeVisible();
  expect((await page.request.get(audioUrl)).status()).toBe(404);
  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByTestId("audit-panel")).toContainText("Audio deleted per retention policy");
});

test("interpreted visit flags a dosing discrepancy and labels languages", async ({ page }) => {
  await register(page);
  await openVisit(page, "Ana Morales");
  await consentAndSimulate(page);
  await draftNote(page);
  const flags = page.getByTestId("interpreter-flags");
  await expect(flags).toContainText("1 possible discrepancy");
  await expect(flags).toContainText("numbers differ (4 → 6)");
  await expect(flags).toContainText("Lo uso cada cuatro horas");
  await expect(page.getByTestId("lang-chip").first()).toBeVisible();
  await expect(page.getByTestId("section-subjective")).toContainText("Visit conducted with an interpreter; patient's preferred language is Spanish.");
  await expect(page.getByTestId("section-assessment_plan")).toContainText("Start tiotropium daily.");
  await expect(page.getByTestId("section-assessment_plan")).not.toContainText("Pneumonia, unspecified");
  await flags.getByRole("button", { name: "Show in transcript" }).click();
  await expect(page.getByTestId("transcript").locator(".ring-1")).toHaveCount(2);
});

test("settings expose audio retention and speech provider", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await expect(page.getByTestId("speech-settings")).toContainText("Deepgram Nova-3");
  await page.getByLabel("Audio retention").selectOption("30");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Audio retention")).toHaveValue("30");
});
