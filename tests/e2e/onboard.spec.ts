import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dial } from "./fake-twilio.mjs";
import { mailCode, register, textCode } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");
const MOCK_DG = "http://localhost:3299";
const MOCK = "http://localhost:3295";
const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const texts = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/texts?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const randomPhone = () => `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function record(request: APIRequestContext) {
  const r = await request.post("/api/capture?consent=granted&state=IL&durationS=22&reason=Cough", { headers: { "content-type": "audio/wav" }, data: wav });
  expect(r.status()).toBe(202);
  const { encounterId, statusUrl } = await r.json();
  await expect.poll(async () => (await (await request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  return encounterId as string;
}

async function signViaApi(request: APIRequestContext, encId: string) {
  const d = ((await (await request.get("/api/decisions?kinds=note.sign")).json()).decisions as { id: string; encounterId: string }[]).find((x) => x.encounterId === encId)!;
  const r = await request.post(`/api/decisions/${encodeURIComponent(d.id)}`, { data: { action: "approve", payload: { force: true, reviewMs: 60000 }, channel: "stack" } });
  expect(r.ok(), await r.text()).toBe(true);
}

async function signUp(page: Page, opts: { npi?: string; name?: string } = {}) {
  const email = `onboard-${uniq()}@clinic.test`;
  await page.goto("/register");
  await expect(page.locator("#password")).toHaveCount(0);
  if (opts.npi) {
    await page.getByTestId("npi-input").fill(opts.npi);
    await expect(page.getByTestId("npi-verified")).toBeVisible();
  } else await page.fill("#name", opts.name ?? "Jordan Lee");
  await page.fill("#email", email);
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("register-code-form")).toBeVisible();
  await page.getByTestId("register-code").fill(await mailCode(page, email));
  await page.getByTestId("register-verify").click();
  await page.waitForURL(/\/go\?welcome=1$/);
  return email;
}

test("the front door leads with the no-signup sample call, with create account second", async ({ page }) => {
  await page.goto("/");
  const primary = page.getByTestId("home-sample");
  await expect(primary).toHaveClass(/btn-primary/);
  await expect(primary).toHaveAttribute("href", "/go/phone?autopilot=1");
  await expect(page.getByTestId("home-create")).toHaveAttribute("href", "/register");
  await page.getByTestId("home-create").click();
  await page.waitForURL(/\/register$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your free account");
  await page.goto("/");
  await primary.click();
  await page.waitForURL(/\/go\/phone\?autopilot=1$/);
  await expect(page.getByTestId("sim-call")).toBeVisible();
});

test("sign-up is passwordless, lands on the recorder, and shows the simple nav without a survey", async ({ page }) => {
  const email = await signUp(page, { name: "Jordan Lee" });
  await expect(page.getByTestId("go-welcome")).toBeVisible();
  await expect(page.getByTestId("go")).toHaveAttribute("data-phase", "idle");
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(me).toMatchObject({ email, name: "Jordan Lee", guestUntil: null });
  expect(me.prefs).toMatchObject({ simpleNav: true });
  await page.goto("/today");
  const nav = page.getByTestId("nav");
  await expect(nav).toHaveAttribute("data-mode", "simple");
  await expect(nav.getByRole("link")).toHaveText(["Record", "To review", "Patients", "Settings"]);
  await expect(page.getByTestId("survey")).toHaveCount(0);
  await expect(page.getByText(/Engine:/)).toHaveCount(0);
  await nav.getByTestId("show-all-tools").click();
  await expect(nav).toHaveAttribute("data-mode", "full");
  await expect(nav.getByRole("link", { name: "Revenue" })).toBeVisible();
});

test("password sign-in still works for accounts that have one", async ({ page }) => {
  const email = await register(page, "Dr. Pat Old");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.fill("#email", email);
  await page.fill("#password", "correct-horse-9");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/today$/);
});

test("typing an NPI fills name, specialty, the verified badge and the specialty template", async ({ page }) => {
  await page.goto("/register");
  await page.getByTestId("npi-input").fill("1003000126");
  await expect(page.getByTestId("npi-verified")).toContainText("Sam Patel, PT, Physical Therapist, TX");
  await expect(page.getByTestId("npi-verified")).toContainText("Physical therapy daily note");
  await expect(page.locator("#name")).toHaveValue("Sam Patel, PT");
  await expect(page.getByTestId("register-specialty")).toHaveValue("Physical Therapy");
  await page.getByTestId("npi-input").fill("1234567890");
  await expect(page.getByText("That isn't a valid 10-digit NPI")).toBeVisible();
  await signUp(page, { npi: "1588667703" });
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(me).toMatchObject({ name: "Morgan Blake, LCSW", specialty: "Psychotherapy" });
  expect(me.prefs.npi).toMatchObject({ number: "1588667703", matched: true });
  expect(me.prefs).toMatchObject({ defaultTemplate: "bh_dap" });
});

test("a phone guest saves the note with a code texted to the number that called", async ({ page, baseURL, request }) => {
  const from = randomPhone();
  const call = await dial({ base: baseURL!, from, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { hangup: true }] });
  expect(call.connected).toBe(true);
  await expect.poll(async () => (await texts(request, from)).length, { timeout: 30000 }).toBeGreaterThan(0);
  const link = /(http:\/\/\S+\/m\/\S+)/.exec((await texts(request, from)).at(-1)!.body)![1];
  await page.goto(link);
  await page.getByTestId("magic-go").click();
  await page.waitForURL(/\/go\/stack/);
  const banner = page.getByTestId("claim-banner");
  await expect(banner).toHaveAttribute("data-via", "phone");
  await expect(page.getByTestId("stack-count")).toHaveText("Your note");
  await expect(page.getByTestId("stack-card")).toHaveAttribute("data-kind", "note.sign");
  const before = (await texts(request, from)).length;
  await page.getByTestId("claim-text").click();
  await expect(page.getByTestId("claim-code")).toBeVisible();
  await expect.poll(async () => (await texts(request, from)).length).toBeGreaterThan(before);
  const sms = (await texts(request, from)).at(-1)!.body;
  expect(sms).toMatch(/^Your Chartside code is \d{6}\./);
  await page.getByTestId("claim-code").fill("000000");
  await page.getByTestId("claim-verify").click();
  await expect(banner.getByRole("alert")).toHaveText("That code isn't right");
  await page.getByTestId("claim-code").fill(await textCode(page, from));
  await page.getByTestId("claim-verify").click();
  await page.waitForURL(/claimed=1/);
  await expect(banner).toBeHidden();
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(me).toMatchObject({ guestUntil: null, phone: from.replace(/\d(?=\d{4})/g, "•") });
  await expect(page.getByTestId("stack-approve")).toBeEnabled();
});

test("pasting an old note matches its style, shows a before and after, and saves visible rules", async ({ page }) => {
  await signUp(page, { name: "Robin Park" });
  const enc = await record(page.request);
  await page.goto(`/go/stack?focus=${enc}`);
  await expect(page.getByTestId("stack-note")).toContainText("SUBJECTIVE");
  await page.getByTestId("style-open").click();
  await page.getByTestId("style-sample").fill("Mrs. Lopez here for cough.");
  await page.getByTestId("style-check").click();
  await expect(page.getByTestId("style-match").getByRole("alert")).toContainText(/name first|few lines/);
  await page.getByTestId("style-sample").fill(`A/P:
- URI, viral. Supportive care, fluids, rest.
- Return if fever over 3 days or SOB.
- f/u PRN.
S: Pt c/o cough x 5 days, no fever. Pt reports mild congestion.
O:
- Lungs clear
- No distress`);
  await page.getByTestId("style-check").click();
  await expect(page.getByTestId("style-findings")).toContainText("Section order: A/P, S, O");
  const after = await page.getByTestId("style-after").textContent();
  expect(after!.indexOf("A/P")).toBeLessThan(after!.indexOf("\nS\n"));
  await expect(page.getByTestId("style-before")).toContainText("ASSESSMENT & PLAN");
  await page.getByTestId("style-save").click();
  await expect(page.getByTestId("style-done")).toContainText("Your note now uses them");
  await expect(page.getByTestId("stack-note")).toHaveText(/^A\/P/);
  await page.goto("/settings");
  await expect(page.getByTestId("style-rules")).toContainText("Put sections in your order");
  await expect(page.getByTestId("style-rules")).toContainText('Call Subjective "S"');
  await page.goto("/today");
  await expect(page.getByTestId("onboarding-item").filter({ hasText: "Make the note yours" })).toHaveAttribute("data-done", "true");
});

test("the simple nav opens up after three signed notes, and the survey waits for five", async ({ page }) => {
  await signUp(page, { name: "Casey Moreno" });
  for (let i = 0; i < 2; i++) await signViaApi(page.request, await record(page.request));
  await page.goto("/patients");
  await expect(page.getByTestId("nav")).toHaveAttribute("data-mode", "simple");
  await signViaApi(page.request, await record(page.request));
  await page.goto("/patients");
  await expect(page.getByTestId("nav")).toHaveAttribute("data-mode", "full");
  await page.goto("/today");
  await expect(page.getByTestId("survey")).toHaveCount(0);
  for (let i = 0; i < 2; i++) await signViaApi(page.request, await record(page.request));
  await page.goto("/today");
  await expect(page.getByTestId("survey")).toBeVisible();
});

test.describe("in a Los Angeles browser", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("the demo day, the stack and texts use the viewer's time zone", async ({ page }) => {
    await register(page, "Dr. West Coast");
    const me = (await (await page.request.get("/api/auth/me")).json()).user;
    expect(me.prefs.tz).toBe("America/Los_Angeles");
    await expect(page.getByTestId("visit-row").first()).toContainText("8:30 AM");
    const enc = await record(page.request);
    const d = ((await (await page.request.get("/api/decisions?kinds=note.sign")).json()).decisions as { encounterId: string; title: string; safeLabel: string }[]).find((x) => x.encounterId === enc)!;
    const la = (ms: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(ms));
    const now = Date.now();
    const ok = [-2, -1, 0, 1].map((m) => la(now + m * 60000));
    expect(ok.some((t) => d.safeLabel.includes(t))).toBe(true);
  });
});

test("the sign-up page passes an accessibility scan at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.getByTestId("npi-input").fill("1234567893");
  await expect(page.getByTestId("npi-verified")).toBeVisible();
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.target}`));
  expect(v).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("Continue with Google creates an account and lands on the recorder", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByTestId("oauth-google")).toBeVisible();
  await expect(page.getByTestId("oauth-microsoft")).toHaveCount(0);
  const email = `g-${uniq()}@gmail.test`;
  await page.goto(`/api/auth/oauth/google?hint=${encodeURIComponent(email)}`);
  await page.waitForURL(/\/go\?welcome=1$/);
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(me).toMatchObject({ email, guestUntil: null });
  expect(me.prefs.simpleNav).toBe(true);
  await page.context().clearCookies();
  await page.goto(`/api/auth/oauth/google?hint=${encodeURIComponent(email)}`);
  await page.waitForURL(/\/go$/);
  expect((await (await page.request.get("/api/auth/me")).json()).user.email).toBe(email);
});

test("a Google sign-in callback only finishes in the browser that started it", async ({ page, browser }) => {
  const email = `csrf-${uniq()}@gmail.test`;
  const start = await page.request.get(`/api/auth/oauth/google?hint=${encodeURIComponent(email)}`, { maxRedirects: 0 });
  const authorize = start.headers()["location"];
  expect(authorize).toBeTruthy();
  const back = await page.request.get(authorize, { maxRedirects: 0 });
  const callback = back.headers()["location"];
  expect(callback).toContain("state=");
  const victim = await (await browser.newContext()).newPage();
  await victim.goto(callback);
  await victim.waitForURL(/\/login\?error=/);
  await expect(victim.getByText("This sign-in didn't start in this browser")).toBeVisible();
  expect((await victim.request.get("/api/auth/me")).status()).toBe(401);
});
