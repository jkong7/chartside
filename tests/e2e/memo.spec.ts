import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { twilioSignature } from "./fake-twilio.mjs";
import { register } from "./helpers";

test.describe.configure({ mode: "serial" });

const MOCK = "http://localhost:3295";
const LINE = "+13125550199";
const PHI = /(diagnos|assessment|cough|respiratory|fever|James|Biscuit|Duchess|lame|bute)/i;

type Text = { to: string; body: string };
const texts = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/texts?to=${encodeURIComponent(to)}`)).json()) as Text[];
const mediaLog = async (request: APIRequestContext) => (await (await request.get(`${MOCK}/media-log`)).json()) as { gets: string[]; deletes: string[]; unauthorized: number; live: string[] };

function randomPhone() {
  return `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

let seq = 0;
async function addMedia(request: APIRequestContext, opts: { fixture?: string; contentType?: string; bytes?: number } = {}) {
  const sid = `ME${Date.now()}${++seq}`;
  const messageSid = `MM${Date.now()}${seq}`;
  const r = await request.post(`${MOCK}/media`, { data: { sid, messageSid, ...opts } });
  return { sid, messageSid, url: ((await r.json()) as { url: string }).url };
}

async function webhook(request: APIRequestContext, baseURL: string, path: string, params: Record<string, string>) {
  const res = await request.post(path, { form: params, headers: { "x-twilio-signature": twilioSignature("test-twilio", `${baseURL}${path}`, params) } });
  expect(res.status()).toBe(200);
  const xml = await res.text();
  return (/<Message>([\s\S]*)<\/Message>/.exec(xml)?.[1] ?? "").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
}

const sms = (request: APIRequestContext, baseURL: string, from: string, body: string, media?: { url: string; messageSid: string; type?: string }) =>
  webhook(request, baseURL, "/api/sms/incoming", { From: from, To: LINE, Body: body, MessageSid: media?.messageSid ?? `SM${Date.now()}`, NumMedia: media ? "1" : "0", ...(media ? { MediaUrl0: media.url, MediaContentType0: media.type ?? "audio/wav" } : {}) });

const whatsapp = (request: APIRequestContext, baseURL: string, from: string, body: string, media?: { url: string; messageSid: string }) =>
  webhook(request, baseURL, "/api/whatsapp/incoming", { From: `whatsapp:${from}`, To: `whatsapp:${LINE}`, WaId: from.slice(1), ProfileName: "Doc", Body: body, MessageSid: media?.messageSid ?? `SM${Date.now()}`, NumMedia: media ? "1" : "0", ...(media ? { MediaUrl0: media.url, MediaContentType0: "audio/ogg" } : {}) });

async function verifiedPhone(page: Page) {
  const phone = randomPhone();
  expect((await page.request.post("/api/auth/phone", { data: { phone } })).ok()).toBe(true);
  const code = /\b(\d{6})\b/.exec((await texts(page.request, phone)).at(-1)!.body)![1];
  expect((await page.request.post("/api/auth/phone/verify", { data: { code } })).ok()).toBe(true);
  return phone;
}

async function registerVet(page: Page, name: string) {
  await page.goto("/register?specialty=Veterinary%3A%20Equine");
  await expect(page.locator("#specialty")).toHaveValue("Veterinary: Equine");
  await page.fill("#name", name);
  await page.fill("#email", `vet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@chartside.test`);
  await page.fill("#password", "correct-horse-9");
  await page.click("button[type=submit]");
  await page.waitForURL("**/today");
}

async function waitText(request: APIRequestContext, to: string, re: RegExp, timeout = 60_000) {
  let found: Text | undefined;
  await expect.poll(async () => (found = (await texts(request, to)).find((t) => re.test(t.body))) !== undefined, { timeout }).toBe(true);
  return found!;
}

const linkOf = (body: string) => /(http:\/\/localhost:3200\/m\/[\w-]+)/.exec(body)![1];

async function openLink(page: Page, body: string) {
  await page.goto(linkOf(body));
  await page.getByTestId("magic-go").click();
}

test("a texted voice memo waits for YES, deletes Twilio's copy, and texts a PHI-free link to a note you can sign", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Memo Morgan");
  const phone = await verifiedPhone(page);
  const media = await addMedia(request);
  const ack = await sms(request, baseURL!, phone, "", media);
  expect(ack).toBe("Got your 0:22 recording. Reply YES if your patient agreed to be recorded, or NO to delete it. Nothing is written until you reply, and it is deleted after 24 hours.");
  const log = await mediaLog(request);
  expect(log.gets).toContain(media.sid);
  expect(log.deletes).toContain(media.sid);
  expect(log.live).not.toContain(media.sid);
  const yes = await sms(request, baseURL!, phone, "YES");
  expect(yes).toContain("Writing the note from your 0:22 recording");
  const ready = await waitText(request, phone, /is ready\. Review and sign:/);
  expect(ready.body).toMatch(/^Chartside: your note from the 0:22 recording is ready\. Review and sign: http:\/\/localhost:3200\/m\/[\w-]+$/);
  for (const t of await texts(request, phone)) expect(t.body).not.toMatch(PHI);
  await page.context().clearCookies();
  await openLink(page, ready.body);
  await page.waitForURL(/\/go\/stack\?focus=enc_/);
  const encId = new URL(page.url()).searchParams.get("focus")!;
  await expect(page.getByText(/cough/i).first()).toBeVisible({ timeout: 20_000 });
  const signed = await page.request.post(`/api/encounters/${encId}/sign`, { data: { force: true } });
  expect(signed.ok()).toBe(true);
  expect((await signed.json()).signed).toBe(true);
});

test("replying NO deletes the held memo and nothing is written", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Nora Nay");
  const phone = await verifiedPhone(page);
  const media = await addMedia(request, { fixture: "memo.m4a", contentType: "audio/mp4" });
  expect(await sms(request, baseURL!, phone, "", { ...media, type: "audio/mp4" })).toContain("Got your 0:14 recording. Reply YES");
  expect((await mediaLog(request)).deletes).toContain(media.sid);
  expect(await sms(request, baseURL!, phone, "no")).toBe("Deleted. Nothing from that recording was kept.");
  expect(await sms(request, baseURL!, phone, "yes")).toContain("Texts are back on");
  await page.waitForTimeout(1500);
  expect((await texts(request, phone)).filter((t) => /is ready/.test(t.body))).toHaveLength(0);
});

test("a text that starts with NOTE becomes a dictated note", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Tess Typer");
  const phone = await verifiedPhone(page);
  const r = await sms(request, baseURL!, phone, "Note: follow up for knee pain, doing better with therapy. Exam shows no swelling. Continue physical therapy and recheck in six weeks.");
  expect(r).toContain("Writing the note from your text");
  const ready = await waitText(request, phone, /from the text is ready/);
  expect(ready.body).not.toMatch(/knee|therapy/i);
  await page.context().clearCookies();
  await openLink(page, ready.body);
  await page.waitForURL(/\/go\/stack/);
  await expect(page.getByText(/physical therapy/i).first()).toBeVisible({ timeout: 20_000 });
});

test("a memo too big to text gets a single-use upload link that writes the note", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Ursa Upload");
  const phone = await verifiedPhone(page);
  const big = await addMedia(request, { bytes: 26 * 1024 * 1024 });
  const r = await sms(request, baseURL!, phone, "", big);
  expect(r).toMatch(/^That recording is over 25 MB\. Too big to text\? Upload it here\. The link works once, for 30 minutes: http:\/\/localhost:3200\/m\/[\w-]+$/);
  expect((await mediaLog(request)).deletes).toContain(big.sid);
  const again = await sms(request, baseURL!, phone, "UPLOAD");
  expect(again).toMatch(/Upload it here/);
  await page.context().clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await openLink(page, r);
  await page.waitForURL(/\/go\/upload/);
  await page.getByTestId("memo-file").setInputFiles("tests/e2e/fixtures/memo.m4a");
  await expect(page.getByTestId("memo-picked")).toContainText("memo.m4a");
  await expect(page.getByTestId("memo-send")).toBeDisabled();
  await page.getByTestId("memo-consent").check();
  await page.getByTestId("memo-send").click();
  await expect(page.getByTestId("memo-review")).toBeVisible({ timeout: 60_000 });
  await page.goto(linkOf(r));
  await expect(page.getByTestId("magic-invalid")).toBeVisible();
});

test("WhatsApp: a US medical practice is refused and the voice note is deleted unread", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Hal Human");
  const phone = await verifiedPhone(page);
  const note = await addMedia(request, { fixture: "voice.ogg", contentType: "audio/ogg" });
  const r = await whatsapp(request, baseURL!, phone, "", note);
  expect(r).toContain("can't take patient recordings over WhatsApp");
  const log = await mediaLog(request);
  expect(log.gets).not.toContain(note.sid);
  expect(log.deletes).toContain(note.sid);
  const stranger = await addMedia(request, { fixture: "voice.ogg", contentType: "audio/ogg" });
  expect(await whatsapp(request, baseURL!, randomPhone(), "", stranger)).toContain("only for veterinary practices");
  expect((await mediaLog(request)).deletes).toContain(stranger.sid);
});

test("WhatsApp: a vet's voice note comes back inline as the record with a link to edit and sign", async ({ page, baseURL, request }) => {
  await registerVet(page, "Dr. Wren Whinny");
  const phone = await verifiedPhone(page);
  const note = await addMedia(request, { fixture: "voice.ogg", contentType: "audio/ogg" });
  const ack = await whatsapp(request, baseURL!, phone, "", note);
  expect(ack).toContain("Got your 0:14 recording. Reply YES if your client agreed to be recorded");
  expect((await mediaLog(request)).deletes).toContain(note.sid);
  expect(await whatsapp(request, baseURL!, phone, "always")).toContain("You won't be asked again");
  const reply = await waitText(request, `whatsapp:${phone}`, /Edit and sign: http:\/\/localhost:3200\/m\//);
  expect(reply.body).toMatch(/cough/i);
  expect(reply.body.length).toBeLessThanOrEqual(1600);
  const sent = await texts(request, `whatsapp:${phone}`);
  expect(sent.every((t) => t.to === `whatsapp:${phone}`)).toBe(true);
});

test("Barn Line: one texted farm call becomes a record per animal, and the owner gets care instructions after signing", async ({ page, baseURL, request }) => {
  await registerVet(page, "Dr. Lee Farrow");
  const phone = await verifiedPhone(page);
  const owner = randomPhone();
  const farm = `Note: Farm call at Miller's barn, owner is Jane Miller, owner's number is ${owner.slice(2)}. First horse is Biscuit, a 12 year old Quarter Horse gelding. Owner reports he has been off on the left front since Tuesday. Grade 2 of 5 lameness left fore, positive hoof testers at the toe. Likely a sole abscess. Gave 2 grams bute PO and pared out the abscess. Stall rest for 3 days and soak the foot twice a day. Next horse, Duchess, a 7 year old Thoroughbred mare. Temperature 100.1, heart rate 36, gut sounds normal. Vaccinated for rabies and West Nile. Moving on to cow 214, a Holstein heifer. Palpated 90 days pregnant. Recheck at 150 days.`;
  expect(await sms(request, baseURL!, phone, farm)).toContain("Writing the note");
  const rec = await waitText(request, phone, /Edit and sign:/);
  const all = (await texts(request, phone)).map((t) => t.body).join("\n");
  expect(all).toContain("Biscuit");
  expect(all).toContain("Duchess");
  expect(all).toContain("Cow 214");
  expect(all).toContain("AAEP lameness grade 2/5, left fore.");
  await page.context().clearCookies();
  await openLink(page, rec.body);
  await page.waitForURL(/\/go\/stack/);
  const list = ((await (await page.request.get("/api/patients")).json()) as { patients: { id: string; name: string }[] }).patients;
  expect(list.map((p) => p.name)).toEqual(expect.arrayContaining(["Biscuit", "Duchess", "Cow 214"]));
  const encList = ((await (await page.request.get("/api/encounters")).json()) as { encounters: { id: string; patientId: string; status: string }[] }).encounters;
  const biscuit = list.find((p) => p.name === "Biscuit")!;
  const enc = encList.find((e) => e.patientId === biscuit.id)!;
  expect(encList.filter((e) => e.status === "review").length).toBeGreaterThanOrEqual(3);
  const signed = await page.request.post(`/api/encounters/${enc.id}/sign`, { data: { force: true } });
  expect((await signed.json()).signed).toBe(true);
  const ownerText = await waitText(request, owner, /Care instructions for Biscuit/, 20_000);
  expect(ownerText.body).toContain("Stall rest for 3 days");
  expect(ownerText.body).toContain("Prepared with Chartside. Reply STOP to opt out.");
});

test("the practice owner switches the practice to veterinary in Admin, Line, and bad values are refused", async ({ page }) => {
  await register(page, "Dr. Owen Owner");
  await page.goto("/admin?tab=line");
  const box = page.getByTestId("line-jurisdiction");
  await expect(box).toBeVisible();
  await expect(page.getByTestId("jurisdiction-us_hipaa")).toBeChecked();
  await page.getByTestId("jurisdiction-veterinary").check();
  await expect(page.getByTestId("jurisdiction-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("jurisdiction-veterinary")).toBeChecked();
  expect((await page.request.post("/api/admin/line", { data: { jurisdiction: "martian" } })).status()).toBe(422);
  expect((await page.request.post("/api/admin/line", { data: { jurisdiction: "us_hipaa" } })).ok()).toBe(true);
});

test("the Barn Line page and the upload page have no serious accessibility problems", async ({ page }) => {
  await page.goto("/barn");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your vet scribe is");
  const scan = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
  expect(await scan()).toEqual([]);
  const og = await page.request.get("/barn/opengraph-image");
  expect(og.ok()).toBe(true);
  expect(og.headers()["content-type"]).toContain("image/png");
  await register(page, "Dr. Ada Access");
  await page.goto("/go/upload");
  await expect(page.getByTestId("memo-upload")).toBeVisible();
  expect(await scan()).toEqual([]);
});
