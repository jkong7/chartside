import { readFileSync } from "node:fs";
import { expect, request as pwRequest, test } from "@playwright/test";
import { register } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");

test("a capture token uploads a recording with no session and reads back the note", async ({ page, baseURL }) => {
  await register(page);
  const minted = await page.request.post("/api/capture/token", { data: { minutes: 30, label: "Voice Memos" } });
  expect(minted.status()).toBe(201);
  const { token, id } = await minted.json();
  const device = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  const form = { consent: "granted", state: "IL", reason: "Cough", audio: { name: "Visit.m4a", mimeType: "application/octet-stream", buffer: wav } };
  const up = await device.post("/api/capture", { multipart: form });
  expect(up.status()).toBe(202);
  const { encounterId, statusUrl, noteUrl, reviewUrl } = await up.json();
  expect(reviewUrl).toBe(`/encounters/${encounterId}`);
  await expect.poll(async () => (await (await device.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  const note = await (await device.get(noteUrl)).json();
  expect(note.sections.length).toBeGreaterThan(1);
  expect(note.codes.diagnoses.length).toBeGreaterThan(0);
  expect((await device.post(`/api/encounters/${encounterId}/sign`, { data: {} })).status()).toBe(401);
  expect((await device.get("/api/encounters")).status()).toBe(401);
  await page.goto("/today");
  await page.goto(reviewUrl);
  await expect(page.getByText(/cough/i).first()).toBeVisible();
  expect((await page.request.delete(`/api/capture/token/${id}`)).status()).toBe(200);
  expect((await device.get(statusUrl)).status()).toBe(401);
  await device.dispose();
});

test("capture refuses uploads without consent or with the wrong type", async ({ page }) => {
  await register(page);
  const noConsent = await page.request.post("/api/capture", { headers: { "content-type": "audio/wav" }, data: wav });
  expect(noConsent.status()).toBe(422);
  const html = await page.request.post("/api/capture?consent=granted", { headers: { "content-type": "text/html" }, data: "<p>hi</p>" });
  expect(html.status()).toBe(415);
  expect((await page.request.post("/api/capture?consent=granted", { headers: { "content-type": "audio/wav", authorization: "Bearer cs_cap_" + "x".repeat(32) }, data: wav })).status()).toBe(401);
});
