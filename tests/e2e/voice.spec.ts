import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { dial, twilioSignature } from "./fake-twilio.mjs";
import { register } from "./helpers";

test.describe.configure({ mode: "serial" });

const MOCK_DG = "http://localhost:3299";
const MOCK_SMS = "http://localhost:3295";
const texts = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK_SMS}/texts?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const spoken = async (request: APIRequestContext) => ((await (await request.get(`${MOCK_DG}/stats`)).json()) as { spoken: string[] }).spoken;
const PHI = /(diagnos|assessment|hypertension|diabetes|cough|respiratory|metformin|Maria|Gonzalez|Lopez|\bE11|\bJ06)/i;

function randomPhone() {
  return `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

async function cookieHeader(page: Page) {
  return (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function verifiedPhone(page: Page) {
  const phone = randomPhone();
  expect((await page.request.post("/api/auth/phone", { data: { phone } })).ok()).toBe(true);
  const code = /\b(\d{6})\b/.exec((await texts(page.request, phone)).at(-1)!.body)![1];
  expect((await page.request.post("/api/auth/phone/verify", { data: { code } })).ok()).toBe(true);
  return phone;
}

test("the voice webhook rejects unsigned requests and answers signed ones with a media stream", async ({ request, baseURL }) => {
  const params = { CallSid: `CA${Date.now()}`, From: randomPhone(), To: "+13125550199" };
  const unsigned = await request.post("/api/voice/incoming", { form: params });
  expect(unsigned.status()).toBe(403);
  const forged = await request.post("/api/voice/incoming", { form: params, headers: { "x-twilio-signature": "AAAA" } });
  expect(forged.status()).toBe(403);
  const url = `${baseURL}/api/voice/incoming`;
  const ok = await request.post("/api/voice/incoming", { form: params, headers: { "x-twilio-signature": twilioSignature("test-twilio", url, params) } });
  expect(ok.status()).toBe(200);
  const xml = await ok.text();
  expect(xml).toContain('<Stream url="ws://localhost:3200/api/voice/stream">');
  expect(xml).toContain('<Parameter name="callToken"');
  expect(xml).toMatch(/<\/Connect><Hangup\/>/);
  const hidden = await request.post("/api/voice/incoming", { form: { ...params, From: "anonymous" }, headers: { "x-twilio-signature": twilioSignature("test-twilio", url, { ...params, From: "anonymous" }) } });
  expect(await hidden.text()).toContain("hidden number");
});

test("a first-time caller gets a free note by keypad and a PHI-free text to save it", async ({ page, baseURL, request }) => {
  const from = randomPhone();
  const call = await dial({
    base: baseURL!,
    from,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { digit: "5" }, { waitPrompts: 4, timeoutMs: 60000 }, { digit: "1" }, { waitClose: true }],
  });
  expect(call.connected).toBe(true);
  expect(call.closeCode).toBe(1000);
  const said = await spoken(request);
  expect(said.some((s) => s.includes("nothing to sign up for"))).toBe(true);
  expect(said.some((s) => s.startsWith("Here's your note.") && /respiratory/i.test(s))).toBe(true);
  await expect.poll(async () => (await texts(request, from)).length, { timeout: 15000 }).toBeGreaterThan(0);
  const sms = (await texts(request, from)).at(-1)!.body;
  expect(sms).toMatch(/^Chartside: your note from the .* call is ready\. Tap to save it \(free\): http:\/\/localhost:3200\/m\//);
  expect(sms.replace(/https?:\/\/\S+/, "")).not.toMatch(PHI);
  const link = /(http:\/\/\S+)/.exec(sms)![1];
  await page.goto(link);
  await page.getByTestId("magic-go").click();
  await page.waitForURL(/\/go\/stack/);
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.user.guestUntil).toBeTruthy();
  expect(me.user.phone).toBe(from.replace(/\d(?=\d{4})/g, "•"));
});

test("the caller can hang up mid-visit and still gets a text when the note is ready", async ({ baseURL, request }) => {
  const from = randomPhone();
  await dial({
    base: baseURL!,
    from,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { hangup: true }],
  });
  await expect.poll(async () => (await texts(request, from)).length, { timeout: 30000 }).toBeGreaterThan(0);
  expect((await texts(request, from)).at(-1)!.body).toContain("is ready");
});

test("pressing a key while the line is talking cuts it off and acts right away", async ({ baseURL, request }) => {
  const from = randomPhone();
  const started = Date.now();
  const call = await dial({ base: baseURL!, from, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, realtimeMarks: true, steps: [{ sleep: 400 }, { digit: "2" }, { waitPrompts: 1, timeoutMs: 10000 }, { hangup: true }] });
  expect(call.clears).toBeGreaterThan(0);
  expect(Date.now() - started).toBeLessThan(6000);
  expect((await spoken(request)).some((s) => s.startsWith("Thanks. I'm listening"))).toBe(true);
});

test("a declined consent records nothing and texts nothing", async ({ baseURL, request }) => {
  const from = randomPhone();
  const call = await dial({ base: baseURL!, from, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "0" }, { waitClose: true }] });
  expect(call.closeCode).toBe(1000);
  expect((await spoken(request)).some((s) => s.startsWith("Understood. Nothing was recorded"))).toBe(true);
  await new Promise((r) => setTimeout(r, 1500));
  expect(await texts(request, from)).toEqual([]);
});

test("a verified clinician with a PIN hears their next patient, speaks commands, and the note joins their stack", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Riley Park");
  const phone = await verifiedPhone(page);
  expect((await page.request.post("/api/auth/phone/pin", { data: { pin: "4812" } })).ok()).toBe(true);
  const pts = (await (await page.request.get("/api/patients")).json()).patients as { id: string; name: string }[];
  const patient = pts[0];
  const made = await page.request.post("/api/encounters", { data: { patientId: patient.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Cough" } });
  expect(made.ok()).toBe(true);
  const scheduledId = (await made.json()).encounter.id as string;
  const call = await dial({
    base: baseURL!,
    from: phone,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [
      { waitPrompts: 1 },
      { digit: "4" },
      { digit: "8" },
      { digit: "1" },
      { digit: "2" },
      { digit: "#" },
      { waitPrompts: 2 },
      { say: "Yes, that's her." },
      { waitPrompts: 3 },
      { say: "She agreed." },
      { waitPrompts: 4 },
      { wav: "tests/e2e/fixtures/visit.wav" },
      { say: "Chartside, pause." },
      { waitPrompts: 5 },
      { say: "Chartside resume." },
      { waitPrompts: 6 },
      { say: "Chartside, end visit." },
      { waitPrompts: 8, timeoutMs: 60000 },
      { say: "Looks good, ready to sign." },
      { waitClose: true },
    ],
  });
  expect(call.closeCode).toBe(1000);
  const said = await spoken(request);
  expect(said.some((s) => s.includes(patient.name) && s.includes("Is that who you're seeing?"))).toBe(true);
  expect(said).toContain("Paused. Nothing is being recorded. Say Chartside, resume, or press 2 to keep going.");
  await expect.poll(async () => (await texts(request, phone)).filter((t) => t.body.includes("Review and sign")).length, { timeout: 15000 }).toBe(1);
  const sms = (await texts(request, phone)).find((t) => t.body.includes("Review and sign"))!.body;
  expect(sms.replace(/https?:\/\/\S+/, "")).not.toMatch(PHI);
  const enc = await (await page.request.get(`/api/encounters/${scheduledId}`)).json();
  expect(enc.encounter.status).toBe("review");
  const d = await (await page.request.get("/api/decisions")).json();
  const card = d.decisions.find((x: { id: string }) => x.id === `sign:${scheduledId}`);
  expect(card.detail.markedReady.label).toMatch(/^Marked ready on a call at/);
  expect(d.decisions.find((x: { kind: string }) => x.kind === "note.sign").id).toBe(card.id);
});

test("a wrong PIN falls back to record-only and never names a patient", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Sam Ortiz");
  const phone = await verifiedPhone(page);
  await page.request.post("/api/auth/phone/pin", { data: { pin: "4812" } });
  const before = (await spoken(request)).length;
  const call = await dial({ base: baseURL!, from: phone, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "1" }, { digit: "1" }, { digit: "1" }, { digit: "1" }, { digit: "#" }, { waitPrompts: 2 }, { hangup: true }] });
  expect(call.connected).toBe(true);
  const mine = (await spoken(request)).slice(before).filter((s) => s.includes("Dr. Sam Ortiz") || s.includes("didn't match"));
  expect(mine.some((s) => s.includes("didn't match"))).toBe(true);
  expect(mine.join(" ")).not.toMatch(/Is that who you're seeing/);
});

test("texting the line answers with the queue and a link, never patient details", async ({ page, baseURL, request }) => {
  const url = `${baseURL}/api/sms/incoming`;
  const stranger = { From: randomPhone(), To: "+13125550199", Body: "hi", MessageSid: "SM1" };
  expect((await request.post("/api/sms/incoming", { form: stranger })).status()).toBe(403);
  const pitch = await request.post("/api/sms/incoming", { form: stranger, headers: { "x-twilio-signature": twilioSignature("test-twilio", url, stranger) } });
  expect(await pitch.text()).toContain("AI scribe you can call");
  await register(page, "Dr. Noor Haddad");
  const phone = await verifiedPhone(page);
  const status = { From: phone, To: "+13125550199", Body: "status", MessageSid: "SM2" };
  const xml = await (await request.post("/api/sms/incoming", { form: status, headers: { "x-twilio-signature": twilioSignature("test-twilio", url, status) } })).text();
  expect(xml).toMatch(/<Message>Chartside: .*to clear\. Open: http:\/\/localhost:3200\/m\/[\w-]+<\/Message>/);
  expect(xml).not.toMatch(PHI);
});

test("the nudge job refuses callers without the cron secret", async ({ request }) => {
  expect((await request.post("/api/cron/nudges")).status()).toBe(401);
  expect((await request.post("/api/cron/nudges", { headers: { authorization: "Bearer wrong-cron" } })).status()).toBe(401);
  const ok = await request.post("/api/cron/nudges", { headers: { authorization: "Bearer test-cron" } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ sent: expect.any(Number) });
});
