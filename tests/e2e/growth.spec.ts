import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { register } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");

async function recordAndSign(request: APIRequestContext) {
  const r = await request.post("/api/capture?consent=granted&state=IL&durationS=22", { headers: { "content-type": "audio/wav" }, data: wav });
  const { encounterId, statusUrl } = await r.json();
  await expect.poll(async () => (await (await request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  const s = await request.post(`/api/decisions/${encodeURIComponent(`sign:${encounterId}`)}`, { data: { action: "approve", payload: { reviewMs: 60000, force: true }, channel: "stack" } });
  expect(s.status()).toBe(200);
  return encounterId as string;
}

test("an NPI pre-fills and badges the profile as self-attested", async ({ page }) => {
  await register(page, "Dr. Avery Chen");
  const look = await page.request.get("/api/growth/npi?npi=1234567893");
  expect(await look.json()).toMatchObject({ first: "Avery", last: "Chen", state: "IL" });
  expect((await page.request.get("/api/growth/npi?npi=1234567890")).status()).toBe(422);
  const claim = await page.request.post("/api/growth/npi", { data: { npi: "1234567893", state: "IL" } });
  expect(await claim.json()).toMatchObject({ matched: true, badge: expect.stringContaining("self-attested") });
  expect((await (await page.request.get("/api/growth")).json()).npi.matched).toBe(true);
});

test("a referral link credits both clinicians a month after the new one signs a note", async ({ page, browser }) => {
  await register(page, "Dr. Referrer");
  const { referral } = await (await page.request.get("/api/growth")).json();
  const friend = await (await browser.newContext()).newPage();
  const hop = await friend.request.get(referral.url.replace(/^https?:\/\/[^/]+/, ""), { maxRedirects: 0 });
  expect(hop.status()).toBe(303);
  expect(hop.headers()["location"]).toMatch(/\/line\?ref=/);
  await register(friend, "Dr. Friend");
  expect((await (await friend.request.get("/api/growth")).json()).credits.months).toBe(0);
  await recordAndSign(friend.request);
  expect((await (await friend.request.get("/api/growth")).json()).credits.months).toBe(1);
  expect((await (await page.request.get("/api/growth")).json()).credits).toMatchObject({ months: 1, fromReferrals: 1 });
});

test("the weekly receipt page and share image carry no patient information", async ({ page, browser }) => {
  await register(page, "Dr. Receipt");
  await recordAndSign(page.request);
  const patients = (await (await page.request.get("/api/patients")).json()) as { patients?: { name: string; mrn: string }[] } | { name: string; mrn: string }[];
  const list = Array.isArray(patients) ? patients : patients.patients ?? [];
  expect(list.length).toBeGreaterThan(0);
  const r = await page.request.post("/api/growth/receipt");
  expect(r.status()).toBe(201);
  const { url } = await r.json();
  const path = new URL(url).pathname;
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(path);
  await expect(anon.getByTestId("receipt-notes")).toHaveText(/^[1-9]\d*$/);
  const text = (await anon.locator("body").innerText()).toLowerCase();
  for (const p of list) {
    for (const part of p.name.split(" ")) expect(text).not.toContain(part.toLowerCase());
    expect(text).not.toContain(p.mrn.toLowerCase());
  }
  expect(text).not.toMatch(/cough|james/);
  const og = await anon.request.get(`${path}/opengraph-image`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  expect(await anon.locator('meta[property="og:image"]').getAttribute("content")).toContain("/opengraph-image");
});

test("the patient recap and the external share carry the attribution footers", async ({ page, browser }) => {
  await register(page, "Dr. Footer");
  const enc = await recordAndSign(page.request);
  const pats = (await (await page.request.get("/api/patients")).json()) as { patients?: { id: string }[] } | { id: string }[];
  const patientId = (Array.isArray(pats) ? pats : pats.patients ?? [])[0].id;
  await page.request.post(`/api/decisions/${encodeURIComponent(`match:${enc}`)}`, { data: { action: "approve", payload: { patientId }, channel: "stack" } });
  const share = await (await page.request.post(`/api/encounters/${enc}/share`)).json();
  const patient = await (await browser.newContext()).newPage();
  await patient.goto(share.url);
  await expect(patient.getByTestId("recap-footer")).toContainText("Prepared with Chartside for Dr. Footer");
  await expect(patient.getByTestId("recap-cta")).toHaveAttribute("href", "/line?src=recap");
  const email = `colleague${Date.now()}@partner.test`;
  const ext = await page.request.post(`/api/encounters/${enc}/shares`, { data: { kind: "external", email } });
  expect(ext.status()).toBeLessThan(300);
  const inbox = async () => (await (await page.request.get(`http://localhost:3295/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
  await expect.poll(async () => (await inbox()).length).toBe(1);
  const link = /http\S+\/x\/\S+/.exec((await inbox())[0].body)![0];
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await other.getByTestId("xshare-send").click();
  await expect.poll(async () => (await inbox()).length).toBe(2);
  await other.getByTestId("xshare-code").fill(/\b(\d{6})\b/.exec((await inbox())[1].body)![1]);
  await other.getByTestId("xshare-verify").click();
  await expect(other.getByTestId("shared-footer")).toContainText("Written with Chartside");
  await expect(other.getByTestId("shared-try")).toHaveAttribute("href", /^\/r\/[a-z0-9]{6}\?src=share$/);
});

test("the stack offers the colleague invite once, after the third signed note", async ({ page }) => {
  await register(page, "Dr. Three");
  await recordAndSign(page.request);
  await recordAndSign(page.request);
  const r = await page.request.post("/api/capture?consent=granted&state=IL&durationS=22", { headers: { "content-type": "audio/wav" }, data: wav });
  const { encounterId, statusUrl } = await r.json();
  await expect.poll(async () => (await (await page.request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/go/stack?focus=${encounterId}`);
  await page.getByTestId("stack-approve").click();
  const force = page.getByTestId("stack-force");
  await expect(page.getByTestId("invite-card").or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("invite-card")).toBeVisible();
  await expect(page.getByTestId("invite-url")).toHaveText(/\/r\/[a-z0-9]{6}\?src=invite$/);
  await expect(page.getByTestId("invite-sms")).toHaveAttribute("href", /^sms:/);
  await page.getByTestId("invite-close").click();
  await page.reload();
  expect((await (await page.request.get("/api/growth")).json()).prompts.invite).toBe(false);
});
