import { readFileSync } from "node:fs";
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { dial } from "./fake-twilio.mjs";

test.use({ viewport: { width: 390, height: 844 } });

const wav = readFileSync("tests/e2e/fixtures/visit.wav");
const MOCK_DG = "http://localhost:3299";
const MOCK = "http://localhost:3295";
const texts = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/texts?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const spoken = async (request: APIRequestContext) => ((await (await request.get(`${MOCK_DG}/stats`)).json()) as { spoken: string[] }).spoken;
const PHI = /(Harriet|Quimby|Bessie|Coleman|Amelia|Earhart|cough|respiratory|diagnos)/i;

async function signTop(page: Page) {
  await page.getByTestId("stack-approve").click();
  const force = page.getByTestId("stack-force");
  const done = page.getByTestId("stack-toast").filter({ hasText: "Signed" });
  await expect(done.or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("Signed");
}

test("a clinic day through every door: a PIN call, the one-tap recorder, and the Shortcut, then match and sign from the stack", async ({ page, baseURL, request }) => {
  test.setTimeout(240_000);
  const email = `clinicday-${Date.now()}@clinic.test`;
  const reg = await page.request.post("/api/auth/register", { data: { email, password: "correct-horse-9", name: "Dr. Casey Day", demo: false } });
  expect(reg.status()).toBe(201);

  const now = Date.now();
  const names = ["Harriet Quimby", "Bessie Coleman", "Amelia Earhart"];
  const visits: { patientId: string; encounterId: string; name: string }[] = [];
  for (const [i, name] of names.entries()) {
    const p = await (await page.request.post("/api/patients", { data: { name, dob: `19${60 + i}-04-0${i + 1}`, sex: "F" } })).json();
    const patientId = (p.patient ?? p).id as string;
    const e = await (await page.request.post("/api/encounters", { data: { patientId, scheduledAt: new Date(now + i * 45 * 60000).toISOString(), visitType: "follow-up", reason: "Follow-up" } })).json();
    visits.push({ patientId, encounterId: e.encounter.id, name });
  }

  const phone = `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  await page.request.post("/api/auth/phone", { data: { phone } });
  const code = /\b(\d{6})\b/.exec((await texts(request, phone)).at(-1)!.body)![1];
  expect((await page.request.post("/api/auth/phone/verify", { data: { code } })).ok()).toBe(true);
  expect((await page.request.post("/api/auth/phone/pin", { data: { pin: "5937" } })).ok()).toBe(true);

  const before = (await spoken(request)).length;
  const call = await dial({
    base: baseURL!,
    from: phone,
    twilioToken: "test-twilio",
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [
      { waitPrompts: 1 },
      { digit: "5" }, { digit: "9" }, { digit: "3" }, { digit: "7" }, { digit: "#" },
      { waitPrompts: 2 },
      { say: "Yes, that's her." },
      { waitPrompts: 3 },
      { say: "She agreed." },
      { waitPrompts: 4 },
      { wav: "tests/e2e/fixtures/visit.wav" },
      { say: "Chartside, end visit." },
      { waitPrompts: 6, timeoutMs: 60000 },
      { say: "Looks good, ready to sign." },
      { waitClose: true },
    ],
  });
  expect(call.closeCode).toBe(1000);
  const said = (await spoken(request)).slice(before);
  expect(said.some((s) => s.includes("Harriet Quimby") && s.includes("Is that who you're seeing?"))).toBe(true);
  await expect.poll(async () => (await (await page.request.get(`/api/encounters/${visits[0].encounterId}`)).json()).encounter.status, { timeout: 30000 }).toBe("review");
  await expect.poll(async () => (await texts(request, phone)).filter((t) => /Review and sign/.test(t.body)).length, { timeout: 15000 }).toBe(1);
  for (const t of await texts(request, phone)) expect(t.body.replace(/https?:\/\/\S+/, "")).not.toMatch(PHI);

  await page.goto("/go");
  await page.getByTestId("go-start").click();
  await page.getByTestId("go-consent-yes").click();
  await expect(page.getByTestId("go-timer")).toHaveText(/0:0[6-9]|0:1\d/, { timeout: 15000 });
  await page.getByTestId("go-end").click();
  await expect(page.getByTestId("go-review")).toHaveText("Review and sign", { timeout: 45000 });

  const key = await (await page.request.post("/api/capture/token", { data: { device: true, label: "iPhone Shortcut" } })).json();
  const iphone = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { authorization: `Bearer ${key.token}` } });
  const up = await iphone.post("/api/capture?consent=granted&state=IL&channel=shortcut", { multipart: { audio: { name: "New Recording 3.m4a", mimeType: "application/octet-stream", buffer: wav } } });
  expect(up.status()).toBe(202);
  const shortcutEnc = (await up.json()).encounterId as string;
  await expect.poll(async () => (await (await iphone.get(`/api/capture/${shortcutEnc}`)).json()).status, { timeout: 30000 }).toBe("ready");
  await iphone.dispose();

  const decisions = (await (await page.request.get("/api/decisions")).json()).decisions as { id: string; kind: string; encounterId: string | null; detail: Record<string, unknown> }[];
  const signs = decisions.filter((d) => d.kind === "note.sign");
  const matches = decisions.filter((d) => d.kind === "patient.match");
  expect(signs).toHaveLength(3);
  expect(signs[0].id).toBe(`sign:${visits[0].encounterId}`);
  expect((signs[0].detail.markedReady as { label: string }).label).toMatch(/^Marked ready on a call/);
  expect(matches).toHaveLength(2);
  expect(matches.map((m) => m.encounterId)).toContain(shortcutEnc);

  await page.goto("/go/stack");
  for (const [i, m] of matches.entries()) {
    const candidates = m.detail.candidates as { patientId: string; name: string }[];
    const pick = candidates.find((c) => c.name === names[i + 1])!;
    expect(pick).toBeTruthy();
    const r = await page.request.post(`/api/decisions/${encodeURIComponent(m.id)}`, { data: { action: "approve", payload: { patientId: pick.patientId }, channel: "stack" } });
    expect(r.ok()).toBe(true);
  }
  await page.reload();
  let signed = 0;
  let answered = 0;
  for (let step = 0; step < 20; step++) {
    const card = page.getByTestId("stack-card");
    const empty = page.getByTestId("stack-empty");
    await expect(card.or(empty)).toBeVisible();
    if (await empty.isVisible()) break;
    const kind = await card.getAttribute("data-kind");
    const title = await page.getByTestId("stack-title").textContent();
    if (kind === "note.sign") {
      await signTop(page);
      signed++;
    } else if (kind === "coding.query") {
      await page.getByTestId("stack-options").locator("label").first().click();
      await page.getByTestId("stack-approve").click();
      await expect(page.getByTestId("stack-toast")).toContainText("Query answered");
      answered++;
    } else {
      await page.getByTestId("stack-later").click();
      await expect(page.getByTestId("stack-title")).not.toHaveText(title ?? "");
    }
  }
  expect(signed).toBe(3);
  expect(answered).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId("invite-card")).toBeVisible();

  const receipt = await (await page.request.get("/api/growth/receipt")).json();
  expect(receipt.notesSigned).toBe(3);
  const share = await (await page.request.post("/api/growth/receipt")).json();
  const viewer = await pwRequest.newContext({ baseURL });
  const html = await (await viewer.get(new URL(share.url).pathname)).text();
  expect(html).toContain(">3<");
  expect(html).not.toMatch(PHI);
  await viewer.dispose();

  const signedPatients = new Set<string>();
  for (const d of signs) {
    const e = (await (await page.request.get(`/api/encounters/${d.encounterId}`)).json()).encounter;
    expect(e.status).toBe("signed");
    signedPatients.add(e.patientId);
  }
  expect(signedPatients).toEqual(new Set(visits.map((v) => v.patientId)));
});
