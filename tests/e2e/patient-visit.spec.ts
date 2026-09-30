import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { mailCode } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

const MOCK = "http://localhost:3295";
const texts = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/texts?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const mail = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/messages?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const randomPhone = () => `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const PHI = /cough|respiratory|fever|James|Maria|Priya|viral|infection/i;

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function startVisit(page: Page, state: string, name = "Maria") {
  await page.goto("/visit");
  await page.getByTestId("visit-name").fill(name);
  await page.getByTestId("visit-state").selectOption(state);
  await page.getByTestId("visit-record").click();
  await page.waitForURL(/\/visit\/r\//);
  const token = page.url().split("/visit/r/")[1];
  await page.getByTestId("pv-handoff-go").click();
  await expect(page.getByTestId("pv-ask")).toHaveText(`${name} would like to record this visit for their own notes. A draft note can be offered to you. OK to record?`);
  return token;
}

async function recordAndFinish(page: Page) {
  await expect(page.getByTestId("pv-agreed")).toBeVisible();
  await expect(page.getByTestId("pv-timer")).toHaveText(/0:0[6-9]|0:1\d/, { timeout: 20000 });
  await page.getByTestId("pv-pause").click();
  await expect(page.getByTestId("pv-live")).toContainText("Paused");
  await page.getByTestId("pv-resume").click();
  await page.getByTestId("pv-end").click();
  await expect(page.getByTestId("visit-recap")).toBeVisible({ timeout: 60000 });
}

async function signTop(page: Page) {
  await page.getByTestId("stack-approve").click();
  const force = page.getByTestId("stack-force");
  await expect(page.getByTestId("stack-toast").or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("Signed");
}

async function verifiedStranger(browser: Browser) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const email = `pv-stranger-${Date.now()}@elsewhere.test`;
  await page.goto("/login");
  expect((await page.request.post("/api/auth/magic", { data: { email } })).ok()).toBe(true);
  expect((await page.request.post("/api/auth/magic/verify", { data: { email, code: await mailCode(page, email) } })).ok()).toBe(true);
  return { page, email };
}

async function visitByApi(request: APIRequestContext, consent: Record<string, unknown>) {
  const { token } = await (await request.post("/api/visit", { data: { patientName: "Lee", state: "CA" } })).json();
  expect((await request.post(`/api/visit/${token}/consent`, { data: { decision: "granted", ...consent } })).ok()).toBe(true);
  expect((await request.post(`/api/visit/${token}/audio?seq=0`, { headers: { "content-type": "audio/webm" }, data: Buffer.alloc(4000, 1) })).ok()).toBe(true);
  expect((await request.post(`/api/visit/${token}/audio`, { headers: { "content-type": "application/json" }, data: { finish: true, durationS: 30 } })).ok()).toBe(true);
  await expect.poll(async () => (await (await request.get(`/api/visit/${token}`)).json()).status, { timeout: 60000 }).toBe("ready");
  return token as string;
}

test.describe.configure({ mode: "serial" });

test("a patient records with the clinician's OK, shares a recap, and the clinician claims and signs the draft", async ({ page, browser, request }) => {
  const doctorPhone = randomPhone();
  const token = await startVisit(page, "IL");
  await page.getByTestId("pv-offer-details").locator("summary").click();
  await page.getByTestId("pv-clinician-name").fill("Dr. Avery Chen");
  await page.getByTestId("pv-clinician-contact").fill(doctorPhone);
  const a11y = await axe(page, "clinician consent");
  await page.getByTestId("pv-agree").click();
  await recordAndFinish(page);

  await expect(page.getByTestId("visit-headline")).toContainText("Dr. Avery Chen");
  await expect(page.getByTestId("visit-next")).toContainText(/follow-up visit in 1 week/i);
  await expect(page.getByTestId("visit-questions")).toBeVisible();
  await expect(page.getByTestId("visit-footer")).toContainText("Clinicians: get this note as a draft, free.");
  a11y.push(...(await axe(page, "recap")));

  await expect.poll(async () => (await texts(request, doctorPhone)).length, { timeout: 20000 }).toBe(1);
  const sms = (await texts(request, doctorPhone))[0].body;
  expect(sms).toMatch(/^A patient recorded your \d{1,2}:\d{2} [AP]M visit with Chartside and offered you a draft note\. Review it free: http:\/\/\S+\/visit\/c\/\S+$/);
  expect(sms.replace(/https?:\/\/\S+/, "")).not.toMatch(PHI);
  const claimLink = /(http:\/\/\S+\/visit\/c\/\S+)/.exec(sms)![1];
  await expect(page.getByTestId("pv-offer-sent")).toContainText("text to");

  const pdf = await page.request.get(`/api/visit/${token}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByTestId("pv-family-create").click();
  const familyUrl = await page.getByTestId("pv-family-url").inputValue();
  const family = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await family.goto(familyUrl);
  await expect(family.getByTestId("family-view")).toContainText("Maria's visit");
  await expect(family.getByTestId("visit-recap")).toBeVisible();
  await expect(family.getByTestId("pv-delete")).toHaveCount(0);
  await expect(family.getByTestId("pv-transcript")).toHaveCount(0);
  a11y.push(...(await axe(family, "family")));
  await page.getByTestId("pv-family-stop").click();
  await expect(page.getByTestId("pv-family-create")).toBeVisible();
  await family.reload();
  await expect(family.getByTestId("family-gone")).toBeVisible();

  const patientPhone = randomPhone();
  await page.getByTestId("pv-save-contact").fill(patientPhone);
  await page.getByTestId("pv-save-send").click();
  await expect(page.getByTestId("pv-saved")).toContainText(patientPhone.slice(-4));
  await expect.poll(async () => (await texts(request, patientPhone)).length).toBe(1);
  const saved = (await texts(request, patientPhone))[0].body;
  expect(saved).toContain(`/visit/r/${token}`);
  expect(saved.replace(/https?:\/\/\S+/, "")).not.toMatch(PHI);

  const stranger = await verifiedStranger(browser);
  const offerToken = claimLink.split("/visit/c/")[1];
  expect((await stranger.page.request.post(`/api/visit/offer/${offerToken}/claim`)).status()).toBe(403);
  expect((await stranger.page.request.post(`/api/visit/offer/${offerToken}/email`, { data: { email: stranger.email } })).status()).toBe(422);

  const doc = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await doc.goto(claimLink);
  await expect(doc.getByTestId("offer-open")).toBeVisible();
  await expect(doc.getByTestId("offer-open")).not.toContainText(PHI);
  await expect(doc.getByTestId("offer-sent-to")).toHaveText(`the number ending in ${doctorPhone.slice(-4)}`);
  a11y.push(...(await axe(doc, "offer")));
  expect((await doc.request.get(`/api/visit/${token}`)).status()).toBe(200);
  await doc.getByTestId("offer-text-send").click();
  await expect.poll(async () => (await texts(request, doctorPhone)).length).toBe(2);
  const codeText = (await texts(request, doctorPhone))[1].body;
  expect(codeText).toMatch(/^Your Chartside code is \d{6}\./);
  await doc.getByTestId("offer-text-code").fill("000000" === /(\d{6})/.exec(codeText)![1] ? "111111" : "000000");
  await doc.getByTestId("offer-text-verify").click();
  await expect(doc.getByTestId("offer-error")).toContainText("That code isn't right");
  await doc.getByTestId("offer-text-code").fill(/(\d{6})/.exec(codeText)![1]);
  await doc.getByTestId("offer-text-verify").click();
  await expect(doc.getByTestId("offer-text-confirmed")).toBeVisible();
  a11y.push(...(await axe(doc, "offer text confirmed")));
  const email = `pv-doc-${Date.now()}@clinic.test`;
  await doc.getByTestId("offer-email").fill(email);
  await doc.getByTestId("offer-send").click();
  await doc.getByTestId("offer-code").fill(await mailCode(doc, email));
  await doc.getByTestId("offer-verify").click();
  await doc.waitForURL(/\/go\/stack\?focus=enc_/);
  await expect(doc.getByTestId("stack-title")).toContainText("from a patient's recording");
  await expect(doc.getByTestId("stack-from-patient")).toHaveText("From a patient's recording");
  await doc.getByTestId("stack-patient-transcript").locator("summary").click();
  await expect(doc.getByTestId("stack-patient-transcript").getByText(/dry cough/)).toBeVisible();
  await expect(doc.getByTestId("claim-banner")).toHaveCount(0);
  await signTop(doc);

  const again = await (await browser.newContext()).newPage();
  await again.goto(claimLink);
  await expect(again.getByTestId("offer-closed")).toHaveAttribute("data-state", "missing");

  await page.reload();
  await expect(page.getByTestId("pv-offer-claimed")).toBeVisible();
  await page.getByTestId("pv-delete").click();
  await page.getByTestId("pv-delete-yes").click();
  await expect(page.getByTestId("pv-deleted")).toContainText("their copy stays in their own records");
  expect((await page.request.get(`/api/visit/${token}`)).status()).toBe(404);
  await page.goto(`/visit/r/${token}`);
  await expect(page.getByTestId("pv-gone")).toBeVisible();
  expect(a11y).toEqual([]);
});

test("when the clinician says not today, nothing is recorded and the patient gets a notes page", async ({ page }) => {
  const token = await startVisit(page, "TX");
  await page.getByTestId("pv-decline").click();
  await expect(page.getByTestId("pv-declined")).toContainText("Nothing was recorded");
  await expect(page.getByTestId("pv-offer")).toHaveCount(0);
  await expect(page.getByTestId("pv-recorder")).toHaveCount(0);
  const up = await page.request.post(`/api/visit/${token}/audio?seq=0`, { headers: { "content-type": "audio/webm" }, data: Buffer.alloc(2000, 1) });
  expect(up.status()).toBe(422);
  await page.getByTestId("pv-notes-input").fill("New knee brace. Come back in 6 weeks.");
  await page.getByTestId("pv-notes-save").click();
  await expect(page.getByTestId("pv-notes-save")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("pv-notes-input")).toHaveValue("New knee brace. Come back in 6 weeks.");
  const view = await (await page.request.get(`/api/visit/${token}`)).json();
  expect(view.status).toBe("declined");
  expect(view.audioBytes).toBe(0);
  expect((await axe(page, "declined"))).toEqual([]);
});

test("in an all-party state everyone must agree, and a clinician can claim with their NPI from a shared link", async ({ page, browser }) => {
  await page.goto("/visit");
  await page.getByTestId("visit-state").selectOption("CA");
  await expect(page.getByTestId("visit-all-party-hint")).toContainText("California needs everyone in the room to agree");
  expect(await axe(page, "landing")).toEqual([]);
  await page.getByTestId("visit-name").fill("Sam");
  await page.getByTestId("visit-record").click();
  await page.waitForURL(/\/visit\/r\//);
  const token = page.url().split("/visit/r/")[1];
  await page.getByTestId("pv-handoff-go").click();
  await expect(page.getByTestId("pv-all-party")).toBeVisible();
  await page.getByTestId("pv-others").check();
  await expect(page.getByTestId("pv-agree")).toBeDisabled();
  await expect(page.getByTestId("pv-blocked")).toBeVisible();
  const early = await page.request.post(`/api/visit/${token}/consent`, { data: { decision: "granted", othersPresent: true } });
  expect(early.status()).toBe(422);
  await page.getByTestId("pv-others-ok").check();
  await page.getByTestId("pv-offer-details").locator("summary").click();
  await page.getByTestId("pv-clinician-name").fill("Dr. Priya Nair");
  await page.getByTestId("pv-agree").click();
  await recordAndFinish(page);

  await page.getByTestId("pv-offer-create").click();
  const link = await page.getByTestId("pv-offer-url").inputValue();
  await expect(page.getByTestId("pv-offer-link")).toContainText("license number (NPI)");
  expect(link).toMatch(/\/visit\/c\//);

  const doc = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await doc.goto(link);
  await expect(doc.getByTestId("offer-by-npi")).toBeVisible();
  await expect(doc.getByTestId("offer-clinician-name")).toHaveText("Dr. Priya Nair");
  const stranger = await verifiedStranger(browser);
  expect((await stranger.page.request.post(`/api/visit/offer/${link.split("/visit/c/")[1]}/claim`)).status()).toBe(403);
  await doc.getByTestId("offer-npi").fill("1234567893");
  await doc.getByTestId("offer-state").selectOption("IL");
  await doc.getByTestId("offer-npi-go").click();
  await expect(doc.getByTestId("offer-error")).toContainText("doesn't match the name the patient entered");
  await doc.getByTestId("offer-npi").fill("1555555550");
  await doc.getByTestId("offer-state").selectOption("CA");
  await doc.getByTestId("offer-npi-go").click();
  await doc.waitForURL(/\/go\/stack\?focus=enc_/);
  await expect(doc.getByTestId("stack-from-patient")).toBeVisible();
  await expect(doc.getByTestId("claim-banner")).toBeVisible();
  const me = (await (await doc.request.get("/api/auth/me")).json()).user;
  expect(me.name).toBe("Priya Nair");
  expect(me.guestUntil).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId("pv-offer-claimed")).toBeVisible();

  const other = await visitByApi(page.request, { clinicianName: "Dr. Dana Ruiz" });
  const otherLink = (await (await page.request.post(`/api/visit/${other}/offer`)).json()).url as string;
  expect((await doc.request.post(`/api/visit/offer/${otherLink.split("/visit/c/")[1]}/claim`)).status()).toBe(403);
  await doc.goto(otherLink);
  await doc.getByTestId("offer-npi").fill("1555555550");
  await doc.getByTestId("offer-state").selectOption("CA");
  await doc.getByTestId("offer-npi-go").click();
  await expect(doc.getByTestId("offer-error")).toContainText("doesn't match the name the patient entered");
  expect((await (await doc.request.get(`/api/visit/offer/${otherLink.split("/visit/c/")[1]}`)).json()).state).toBe("open");
});

test("an email offer opens only for that email, after a code sent to it", async ({ page, browser, request }) => {
  const doctorEmail = `pv-offer-${Date.now()}@clinic.test`;
  const token = await visitByApi(request, { clinicianName: "Dr. Avery Chen", clinicianContact: doctorEmail });
  await expect.poll(async () => (await request.get(`/api/visit/${token}`)).json().then((v) => v.offer.status), { timeout: 20000 }).toBe("sent");
  const offerMail = (await mail(request, doctorEmail)).at(-1)!.body;
  expect(offerMail.replace(/https?:\/\/\S+/, "")).not.toMatch(PHI);
  const claimLink = /(http:\/\/\S+\/visit\/c\/\S+)/.exec(offerMail)![1];

  const stranger = await verifiedStranger(browser);
  await stranger.page.goto(claimLink);
  await expect(stranger.page.getByTestId("offer-by-email")).toBeVisible();
  await expect(stranger.page.getByTestId("offer-sent-to")).toHaveText("p•••@clinic.test");
  await stranger.page.getByTestId("offer-email").fill(stranger.email);
  await stranger.page.getByTestId("offer-send").click();
  await expect(stranger.page.getByTestId("offer-error")).toContainText("That isn't the email this draft was offered to");
  expect(await axe(stranger.page, "offer by email")).toEqual([]);
  expect((await stranger.page.request.post(`/api/visit/offer/${claimLink.split("/visit/c/")[1]}/claim`)).status()).toBe(403);

  await page.goto(claimLink);
  await page.getByTestId("offer-email").fill(doctorEmail.toUpperCase());
  await page.getByTestId("offer-send").click();
  await expect.poll(async () => (await mail(request, doctorEmail)).length).toBe(2);
  await page.getByTestId("offer-code").fill(/\b(\d{6})\b/.exec((await mail(request, doctorEmail)).at(-1)!.body)![1]);
  await page.getByTestId("offer-verify").click();
  await page.waitForURL(/\/go\/stack\?focus=enc_/);
  await expect(page.getByTestId("stack-from-patient")).toHaveText("From a patient's recording");
  expect((await (await request.get(`/api/visit/${token}`)).json()).offer.status).toBe("claimed");
});
