import { chromium } from "@playwright/test";

const BASE = (process.env.BASE_URL || "http://localhost:3154").replace(/\/$/, "");
const MAIL = (process.env.MOCK_MAIL_URL || "http://localhost:3184").replace(/\/$/, "");
const RUNS = Number(process.env.RUNS || 3);
const TYPE_MS = Number(process.env.TYPE_MS || 90);
const RECORD_S = Number(process.env.RECORD_S || 20);
const only = process.argv[2];

const launch = () =>
  chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=tests/e2e/fixtures/visit.wav", "--autoplay-policy=no-user-gesture-required"] });

async function human(page, selector, text) {
  await page.locator(selector).click();
  await page.locator(selector).pressSequentially(text, { delay: TYPE_MS });
}

async function mailCode(to) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${MAIL}/messages?to=${encodeURIComponent(to)}`).then((x) => x.json()).catch(() => []);
    const m = r.length ? /\b(\d{6})\b/.exec(r.at(-1).body) : null;
    if (m) return m[1];
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("no code arrived");
}

async function noSignup(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/`);
  await page.getByTestId("home-sample").click();
  await page.waitForURL(/\/go\/phone/);
  await page.getByTestId("sim-call").click();
  const skip = page.getByTestId("sim-sample-skip");
  const sample = page.getByTestId("sim-sample");
  await sample.or(skip).first().waitFor({ timeout: 30_000 });
  if (!(await skip.isVisible())) await sample.click().catch(() => {});
  await skip.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await skip.click().catch(() => {});
  const link = page.getByTestId("sim-text-link").first();
  await link.waitFor({ state: "attached", timeout: 150_000 });
  const href = await link.getAttribute("href");
  const note = await ctx.newPage();
  await note.goto(href);
  await note.getByTestId("magic-go").click();
  await note.getByTestId("stack-note").waitFor({ timeout: 30_000 });
  const ms = Date.now() - t0;
  await ctx.close();
  return ms;
}

async function createAccount(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const email = `timing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@clinic.test`;
  const t0 = Date.now();
  await page.goto(`${BASE}/`);
  const create = page.getByTestId("home-create");
  if (await create.count()) await create.click();
  else await page.getByRole("link", { name: /Try it free/ }).click();
  await page.waitForURL(/\/register/);
  await human(page, "#name", "Jordan Lee");
  await human(page, "#email", email);
  const passwordless = (await page.getByTestId("register-form").count()) > 0;
  if (passwordless) {
    await page.getByTestId("register-submit").click();
    await page.getByTestId("register-code").waitFor();
    await human(page, "[data-testid=register-code]", await mailCode(email));
    await page.getByTestId("register-verify").click();
    await page.waitForURL(/\/go/);
  } else {
    await human(page, "#password", "correct-horse-9");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/today/);
    await page.getByTestId("nav").getByRole("link", { name: "Quick record" }).click();
    await page.waitForURL(/\/go$/);
  }
  await page.getByTestId("go-start").click();
  await page.getByTestId("go-consent-yes").click();
  await page.getByTestId("go-live").waitFor();
  await page.waitForTimeout(RECORD_S * 1000);
  await page.getByTestId("go-end").click();
  await page.getByTestId("go-review").click({ timeout: 90_000 });
  await page.getByTestId("stack-note").waitFor({ timeout: 30_000 });
  const ms = Date.now() - t0;
  await ctx.close();
  return { ms, passwordless };
}

const browser = await launch();
const out = { base: BASE, runs: RUNS, typeMsPerChar: TYPE_MS, recordSeconds: RECORD_S, noSignup: [], createAccount: [] };
for (let i = 0; i < RUNS; i++) {
  if (only !== "create") out.noSignup.push(Math.round((await noSignup(browser)) / 100) / 10);
  if (only !== "phone") {
    const r = await createAccount(browser);
    out.passwordless = r.passwordless;
    out.createAccount.push(Math.round(r.ms / 100) / 10);
  }
}
await browser.close();
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
console.log(JSON.stringify({ ...out, medianNoSignup: median(out.noSignup), medianCreateAccount: median(out.createAccount) }, null, 2));
