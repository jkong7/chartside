import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { register } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");
const inbox = async (request: APIRequestContext, to: string) => (await (await request.get(`http://localhost:3295/messages?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const codeIn = (body: string) => /\b(\d{6})\b/.exec(body)![1];

test("sign in with an emailed code from the login page", async ({ page, browser }) => {
  const email = await register(page);
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("/login");
  await fresh.fill("#email", email);
  await fresh.getByTestId("magic-button").click();
  await expect(fresh.getByTestId("magic-code-form")).toContainText("e•••@chartside.test");
  await expect.poll(async () => (await inbox(fresh.request, email)).length).toBe(1);
  const mail = (await inbox(fresh.request, email))[0].body;
  await fresh.getByTestId("magic-code").fill(codeIn(mail) === "000000" ? "111111" : "000000");
  await fresh.getByTestId("magic-submit").click();
  await expect(fresh.locator("form [role=alert]")).toHaveText("That code isn't right");
  await fresh.getByTestId("magic-code").fill(codeIn(mail));
  await fresh.getByTestId("magic-submit").click();
  await fresh.waitForURL("**/today");
  await expect(fresh.getByTestId("visit-row").first()).toBeVisible();
});

test("an emailed link needs a tap on Continue, so link scanners can't spend it", async ({ page, browser }) => {
  const email = `magic-${Date.now()}@clinic.test`;
  const res = await page.request.post("/api/auth/magic", { data: { email, next: "/today" } });
  expect(res.status()).toBe(200);
  await expect.poll(async () => (await inbox(page.request, email)).length).toBe(1);
  const link = /http\S+\/m\/[A-Za-z0-9_-]+/.exec((await inbox(page.request, email))[0].body)![0];
  const scanner = await browser.newContext();
  expect((await scanner.request.get(link)).status()).toBe(200);
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(link);
  await expect(phone.getByTestId("magic-continue")).toContainText("m•••@clinic.test");
  await phone.getByTestId("magic-go").click();
  await phone.waitForURL("**/today");
  const me = await (await phone.request.get("/api/auth/me")).json();
  expect(me.user.email).toBe(email);
  await phone.goto(link);
  await expect(phone.getByTestId("magic-invalid")).toBeVisible();
});

test("try first: a guest records a visit, cannot sign, then claims it by email and signs", async ({ page }) => {
  const t = await page.request.post("/api/auth/try");
  expect(t.status()).toBe(201);
  expect((await t.json()).guest).toBe(true);
  const cap = await page.request.post("/api/capture?consent=granted&state=IL&durationS=22", { headers: { "content-type": "audio/wav" }, data: wav });
  expect(cap.status()).toBe(202);
  const { encounterId, statusUrl, noteUrl } = await cap.json();
  await expect.poll(async () => (await (await page.request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  const note = await (await page.request.get(noteUrl)).json();
  expect(note.text).toMatch(/cough/i);
  const blocked = await page.request.post(`/api/encounters/${encounterId}/sign`, { data: { force: true } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error).toMatch(/Save your note/);
  const email = `claimer-${Date.now()}@clinic.test`;
  expect((await page.request.post("/api/auth/magic", { data: { email } })).status()).toBe(200);
  await expect.poll(async () => (await inbox(page.request, email)).length).toBe(1);
  const v = await page.request.post("/api/auth/magic/verify", { data: { email, code: codeIn((await inbox(page.request, email))[0].body) } });
  expect(v.status()).toBe(200);
  expect((await v.json()).claimed).toBe(1);
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.user.email).toBe(email);
  expect(me.user.guestUntil).toBeNull();
  await page.goto(`/encounters/${encounterId}`);
  await expect(page.getByTestId("note-editor")).toContainText(/cough/i);
  const signed = await page.request.post(`/api/encounters/${encounterId}/sign`, { data: { force: true } });
  expect(signed.status()).toBe(200);
  expect((await (await page.request.get(statusUrl)).json()).status).toBe("signed");
});
