import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { dial } from "./fake-twilio.mjs";
import { register } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

const MOCK_DG = "http://localhost:3299";
const MOCK = "http://localhost:3295";
const texts = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/texts?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const mail = async (request: APIRequestContext, to: string) => (await (await request.get(`${MOCK}/messages?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
const randomPhone = () => `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function guestCall(baseURL: string, request: APIRequestContext) {
  const from = randomPhone();
  const call = await dial({ base: baseURL, from, twilioToken: "test-twilio", mockDeepgram: MOCK_DG, frameMs: 1, steps: [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { hangup: true }] });
  expect(call.connected).toBe(true);
  await expect.poll(async () => (await texts(request, from)).length, { timeout: 30000 }).toBeGreaterThan(0);
  return { from, link: /(http:\/\/\S+\/m\/\S+)/.exec((await texts(request, from)).at(-1)!.body)![1] };
}

async function openStack(page: Page, link: string) {
  await page.goto(link);
  await page.getByTestId("magic-go").click();
  await page.waitForURL(/\/go\/stack/);
  await expect(page.getByTestId("claim-banner")).toBeVisible();
  await expect(page.getByTestId("stack-card")).toHaveAttribute("data-kind", "note.sign");
  await expect(page.getByTestId("stack-note")).toContainText(/respiratory|cough/i);
  await expect(page.getByTestId("stack-approve")).toBeDisabled();
}

async function claim(page: Page, email: string) {
  if ((await page.getByTestId("claim-banner").getAttribute("data-via")) === "phone") await page.getByTestId("claim-switch").click();
  await page.getByTestId("claim-email").fill(email);
  await page.getByTestId("claim-send").click();
  await expect(page.getByTestId("claim-code")).toBeVisible();
  await expect.poll(async () => (await mail(page.request, email)).length).toBeGreaterThan(0);
  await page.getByTestId("claim-code").fill(/\b(\d{6})\b/.exec((await mail(page.request, email)).at(-1)!.body)![1]);
  await page.getByTestId("claim-verify").click();
  await expect(page.getByTestId("claim-banner")).toBeHidden();
}

async function signTop(page: Page) {
  await page.getByTestId("stack-approve").click();
  const force = page.getByTestId("stack-force");
  await expect(page.getByTestId("stack-toast").or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("Signed");
}

test("a first-time caller saves the note from the text into a new account, keeps the phone, and signs", async ({ page, baseURL, request }) => {
  const { from, link } = await guestCall(baseURL!, request);
  await openStack(page, link);
  const email = `caller-${Date.now()}@clinic.test`;
  await claim(page, email);
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(me).toMatchObject({ email, guestUntil: null, phone: from.replace(/\d(?=\d{4})/g, "•") });
  await expect(page.getByTestId("stack-card")).toHaveAttribute("data-kind", "note.sign");
  await signTop(page);
  await page.goto("/go/settings");
  await expect(page.getByTestId("phone-current")).toHaveText(new RegExp(`${from.slice(-4)}$`));
});

test("a caller who already has an account merges the free note into it", async ({ page, browser, baseURL, request }) => {
  const owner = await (await browser.newContext()).newPage();
  const email = await register(owner, "Dr. Existing Caller");
  const before = ((await (await owner.request.get("/api/decisions?kinds=note.sign")).json()) as { decisions: unknown[] }).decisions.length;
  const { from, link } = await guestCall(baseURL!, request);
  await openStack(page, link);
  await claim(page, email);
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(me.email).toBe(email);
  expect(me.phone).toBe(from.replace(/\d(?=\d{4})/g, "•"));
  const after = ((await (await owner.request.get("/api/decisions?kinds=note.sign")).json()) as { decisions: { encounterId: string }[] }).decisions;
  expect(after.length).toBe(before + 1);
});

test("an unclaimed guest link can't be reused, and the text never carries patient details", async ({ page, baseURL, request }) => {
  const { from, link } = await guestCall(baseURL!, request);
  const body = (await texts(request, from)).at(-1)!.body.replace(/https?:\/\/\S+/, "");
  expect(body).not.toMatch(/respiratory|cough|James|Carter|diagnos/i);
  await openStack(page, link);
  const other = await page.context().browser()!.newContext();
  const again = await other.newPage();
  await again.goto(link);
  await expect(again.getByTestId("magic-invalid")).toBeVisible();
});
