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

test("a first-time number gets a few free calls a day, then a polite no", async ({ request, baseURL }) => {
  const from = randomPhone();
  const url = `${baseURL}/api/voice/incoming`;
  const call = async (i: number) => {
    const params = { CallSid: `CAcap${Date.now()}${i}`, From: from, To: "+13125550199" };
    return (await request.post("/api/voice/incoming", { form: params, headers: { "x-twilio-signature": twilioSignature("test-twilio", url, params) } })).text();
  };
  for (let i = 0; i < 5; i++) expect(await call(i)).toContain("<Stream");
  const sixth = await call(6);
  expect(sixth).toContain("at capacity");
  expect(sixth).not.toContain("<Stream");
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

test("the line ends and drafts a visit that reaches the recording limit", async ({ baseURL, request }) => {
  const from = randomPhone();
  const call = await dial({
    base: baseURL!,
    from,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 0,
    steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { silence: 305 }, { waitPrompts: 4, timeoutMs: 60000 }, { hangup: true }],
  });
  expect(call.connected).toBe(true);
  expect((await spoken(request)).some((s) => s.startsWith("This visit has reached the recording limit"))).toBe(true);
  await expect.poll(async () => (await texts(request, from)).length, { timeout: 20000 }).toBeGreaterThan(0);
});

test("a call token cannot start a second stream", async ({ baseURL }) => {
  const params = { CallSid: `CA${Date.now()}replay`, From: randomPhone(), To: "+13125550199" };
  const url = `${baseURL}/api/voice/incoming`;
  const xml = await (await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature("test-twilio", url, params) }, body: new URLSearchParams(params).toString() })).text();
  const callToken = /<Parameter name="callToken" value="([^"]+)"/.exec(xml)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const open = (sid: string) =>
    new Promise<number>((resolve) => {
      const ws = new WebSocket(`${baseURL!.replace(/^http/, "ws")}/api/voice/stream`);
      ws.onopen = () => ws.send(JSON.stringify({ event: "start", streamSid: sid, start: { streamSid: sid, callSid: params.CallSid, customParameters: { callToken } } }));
      ws.onmessage = () => {
        ws.close(1000);
      };
      ws.onclose = (e) => resolve(e.code);
    });
  expect(await open("MZ1")).toBe(1000);
  expect(await open("MZ2")).toBe(1008);
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
  const art = await (await page.request.get(`/api/encounters/${scheduledId}`)).json();
  expect(JSON.stringify(art)).toContain('"verifiedBy":"pin"');
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

test("Admin → Line shows setup and call stats, and an operator points the Twilio number at Chartside", async ({ page, request }) => {
  await page.goto("/register");
  await page.fill("#name", "Operator Olu");
  await page.fill("#email", "operator@chartside.test");
  await page.fill("#password", "correct-horse-9");
  await page.click("button[type=submit]");
  await page.waitForURL("**/today");
  await page.goto("/admin?tab=line");
  const panel = page.getByTestId("line-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-check="speech"]')).toHaveAttribute("data-ok", "true");
  await expect(panel.locator('[data-check="twilio"]')).toHaveAttribute("data-ok", "true");
  await expect(panel).toContainText("http://localhost:3200/api/voice/incoming");
  await expect(page.getByTestId("line-member")).toHaveCount(1);
  await expect(page.getByTestId("line-member")).toHaveAttribute("data-ready", "false");
  await expect(page.getByTestId("line-invite")).toHaveAttribute("href", /^sms:\?&body=.*go%2Fsettings/);
  await page.getByTestId("line-number-input").fill("+1 (312) 555-0199");
  await page.getByTestId("line-connect").click();
  await expect(page.getByTestId("line-connected")).toContainText("+13125550199 now answers with Chartside");
  const nums = (await (await request.get("http://localhost:3295/numbers")).json()) as { voice_url: string; sms_url: string }[];
  expect(nums[0].voice_url).toBe("http://localhost:3200/api/voice/incoming");
  expect(nums[0].sms_url).toBe("http://localhost:3200/api/sms/incoming");
  await page.getByTestId("line-number-input").fill("+13125550100");
  await page.getByTestId("line-connect").click();
  await expect(page.getByTestId("line-panel").getByRole("alert")).toContainText("isn't on this Twilio account");
});

test("an org admin who isn't an operator can see the line but not repoint the number", async ({ page }) => {
  await register(page, "Dr. Admin Only");
  await page.goto("/admin?tab=line");
  await expect(page.getByTestId("line-panel")).toContainText("A Chartside operator connects the phone number");
  const r = await page.request.post("/api/admin/line", { data: { number: "+13125550199" } });
  expect(r.status()).toBe(403);
});

test("a clinician on a call can pause, resume and end the visit from their screen", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Remote Ray");
  const phone = await verifiedPhone(page);
  const call = dial({
    base: baseURL!,
    from: phone,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 5,
    steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { silence: 40 }, { waitPrompts: 6, timeoutMs: 60000 }, { hangup: true }],
  });
  await page.goto("/go");
  const banner = page.getByTestId("live-call");
  await expect(banner).toHaveAttribute("data-state", "recording", { timeout: 20000 });
  await page.getByTestId("live-pause").click();
  await expect(banner).toHaveAttribute("data-state", "paused", { timeout: 10000 });
  await page.getByTestId("live-resume").click();
  await expect(banner).toHaveAttribute("data-state", "recording", { timeout: 10000 });
  await page.getByTestId("live-end").click();
  await expect.poll(async () => ((await banner.count()) ? await banner.getAttribute("data-state") : "gone"), { timeout: 15000 }).toMatch(/drafting|review|gone/);
  const done = await call;
  expect(done.connected).toBe(true);
  const said = await spoken(request);
  expect(said).toContain("Paused. Nothing is being recorded. Say Chartside, resume, or press 2 to keep going.");
  expect(said).toContain("Listening again.");
  await page.goto("/today");
  await expect(page.getByTestId("live-calls")).toHaveCount(0);
  expect((await page.request.post("/api/voice/live/CAnotmine", { data: { action: "end" } })).status()).toBe(404);
});

test("a call without a PIN is flagged on the stack and the clinician can delete it", async ({ page, baseURL }) => {
  await register(page, "Dr. Wary Wu");
  const phone = await verifiedPhone(page);
  await dial({ base: baseURL!, from: phone, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { hangup: true }] });
  await expect.poll(async () => ((await (await page.request.get("/api/decisions")).json()).decisions as { detail: { unverifiedCaller?: unknown } }[]).filter((d) => d.detail.unverifiedCaller).length, { timeout: 30000 }).toBe(1);
  const card = ((await (await page.request.get("/api/decisions")).json()).decisions as { id: string; encounterId: string; title: string; detail: { unverifiedCaller?: unknown } }[]).find((d) => d.detail.unverifiedCaller)!;
  expect(card.title).toMatch(/^Sign note: \d{1,2}:\d{2} [AP]M visit$/);
  await page.goto(`/go/stack?focus=${card.encounterId}`);
  await expect(page.getByTestId("stack-unverified")).toContainText("Caller ID only, no PIN");
  await page.getByTestId("stack-reject").click();
  await expect(page.getByTestId("stack-toast")).toContainText("Deleted");
  expect((await page.request.get(`/api/encounters/${card.encounterId}`)).status()).toBe(404);
});

test("a phone guest who saves their note is shown how to just call next time and can set a PIN", async ({ page, baseURL, request }) => {
  const from = randomPhone();
  await dial({ base: baseURL!, from, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { hangup: true }] });
  await expect.poll(async () => (await texts(request, from)).length, { timeout: 30000 }).toBeGreaterThan(0);
  const link = /(http:\/\/\S+\/m\/\S+)/.exec((await texts(request, from)).at(-1)!.body)![1];
  await page.goto(link);
  await page.getByTestId("magic-go").click();
  await page.waitForURL(/\/go\/stack/);
  const email = `nexttime-${Date.now()}@chartside.test`;
  await page.getByTestId("claim-email").fill(email);
  await page.getByTestId("claim-send").click();
  const mail = async () => (await (await request.get(`http://localhost:3295/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
  await expect.poll(async () => (await mail()).length).toBeGreaterThan(0);
  await page.getByTestId("claim-code").fill(/\b(\d{6})\b/.exec((await mail()).at(-1)!.body)![1]);
  await page.getByTestId("claim-verify").click();
  await page.waitForURL(/claimed=1/);
  await expect(page.getByTestId("next-time")).toContainText("Next time, just call.");
  await expect(page.getByTestId("next-contact")).toHaveAttribute("href", "/line/contact.vcf");
  await page.getByTestId("next-pin").fill("5937");
  await page.getByTestId("next-pin-save").click();
  await expect(page.getByTestId("next-pin-msg")).toContainText("PIN set");
  const pin = await (await page.request.get("/api/auth/phone/pin")).json();
  expect(pin.set).toBe(true);
});

test("three calls at once each get their own visit and their own text", async ({ baseURL, request }) => {
  const phones = [randomPhone(), randomPhone(), randomPhone()];
  const results = await Promise.all(
    phones.map((from) => dial({ base: baseURL!, from, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { digit: "5" }, { waitPrompts: 4, timeoutMs: 60000 }, { digit: "1" }, { waitClose: true }] })),
  );
  expect(results.map((r) => r.closeCode)).toEqual([1000, 1000, 1000]);
  const links = new Set<string>();
  for (const from of phones) {
    await expect.poll(async () => (await texts(request, from)).length, { timeout: 20000 }).toBe(1);
    const body = (await texts(request, from))[0].body;
    links.add(/(http:\/\/\S+)/.exec(body)![1]);
  }
  expect(links.size).toBe(3);
});

test("the clinician asks on the call to text the patient, and the summary goes out only after signing", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Sofia Reyes");
  const phone = await verifiedPhone(page);
  await page.request.post("/api/auth/phone/pin", { data: { pin: "4812" } });
  const pts = (await (await page.request.get("/api/patients")).json()).patients as { id: string; name: string }[];
  const patient = pts.find((p) => p.name === "Maria Gonzalez") ?? pts[0];
  const patientPhone = randomPhone();
  await page.goto(`/patients/${patient.id}`);
  await page.getByTestId("contact-phone").fill(patientPhone);
  await page.getByTestId("contact-save").click();
  await expect(page.getByTestId("contact-phone")).toHaveValue(patientPhone);
  const made = await page.request.post("/api/encounters", { data: { patientId: patient.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Cough" } });
  const encId = (await made.json()).encounter.id as string;
  await dial({
    base: baseURL!,
    from: phone,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [{ waitPrompts: 1 }, { digit: "4" }, { digit: "8" }, { digit: "1" }, { digit: "2" }, { digit: "#" }, { waitPrompts: 2 }, { digit: "1" }, { waitPrompts: 3 }, { digit: "2" }, { waitPrompts: 4 }, { wav: "tests/e2e/fixtures/visit.wav" }, { digit: "5" }, { waitPrompts: 6, timeoutMs: 60000 }, { digit: "7" }, { waitPrompts: 7 }, { digit: "1" }, { waitClose: true }],
  });
  expect((await spoken(request)).some((s) => s.startsWith("I'll text your patient their visit summary"))).toBe(true);
  await new Promise((r) => setTimeout(r, 1000));
  expect(await texts(request, patientPhone)).toEqual([]);
  await page.goto(`/go/stack?focus=${encId}`);
  await expect(page.getByTestId("stack-summary-on-sign")).toBeVisible();
  await page.getByTestId("stack-approve").click();
  const force = page.getByTestId("stack-force");
  await expect(page.getByTestId("stack-toast").or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("summary is on its way");
  await expect.poll(async () => (await texts(request, patientPhone)).length, { timeout: 15000 }).toBe(1);
  const sms = (await texts(request, patientPhone))[0].body;
  expect(sms).toMatch(/your visit summary is ready\. View it securely: http:\/\/localhost:3200\/s\/\w+/);
});

test("Admin → Line lists recent calls with outcomes and no patient details", async ({ page, baseURL }) => {
  await register(page, "Dr. Log Keeper");
  const phone = await verifiedPhone(page);
  await dial({ base: baseURL!, from: phone, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { digit: "5" }, { waitPrompts: 4, timeoutMs: 60000 }, { digit: "1" }, { waitClose: true }] });
  await dial({ base: baseURL!, from: phone, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "0" }, { waitClose: true }] });
  await page.goto("/admin?tab=line");
  const rows = page.getByTestId("line-call-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-outcome", "declined");
  await expect(rows.nth(1)).toHaveAttribute("data-outcome", "marked ready");
  await expect(rows.nth(1)).toContainText("caller ID only");
  await expect(rows.nth(1)).toContainText("sent");
  await expect(page.getByTestId("line-calls-log")).not.toContainText(/Gonzalez|cough|respiratory/i);
});

test("one call can cover two patients in a row", async ({ page, baseURL, request }) => {
  await register(page, "Dr. Two Rooms");
  const phone = await verifiedPhone(page);
  const before = ((await (await page.request.get("/api/decisions")).json()).decisions as { kind: string }[]).filter((d) => d.kind === "note.sign").length;
  const call = await dial({
    base: baseURL!,
    from: phone,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [
      { waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { digit: "5" }, { waitPrompts: 4, timeoutMs: 60000 },
      { digit: "8" }, { waitPrompts: 5 }, { digit: "2" }, { waitPrompts: 6 }, { wav: "tests/e2e/fixtures/visit.wav" }, { digit: "5" }, { waitPrompts: 8, timeoutMs: 60000 },
      { digit: "1" }, { waitClose: true },
    ],
  });
  expect(call.closeCode).toBe(1000);
  await expect.poll(async () => (await texts(request, phone)).filter((t) => t.body.includes("Review and sign")).length, { timeout: 20000 }).toBe(2);
  const after = ((await (await page.request.get("/api/decisions")).json()).decisions as { kind: string; detail: { markedReady?: unknown } }[]).filter((d) => d.kind === "note.sign");
  expect(after.length - before).toBe(2);
  expect(after.filter((d) => d.detail.markedReady).length).toBe(2);
});

test("the line warns once when it can barely hear the room, and not when it can", async ({ baseURL }) => {
  const loud = await dial({ base: baseURL!, from: randomPhone(), twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { sleep: 1500 }, { hangup: true }] });
  expect(loud.prompts).toBe(2);
  const quiet = await dial({ base: baseURL!, from: randomPhone(), twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { silence: 16 }, { waitPrompts: 3 }, { silence: 20 }, { sleep: 1500 }, { hangup: true }] });
  expect(quiet.prompts).toBe(3);
});
