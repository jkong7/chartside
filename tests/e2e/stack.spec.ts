import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { register } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function record(request: APIRequestContext) {
  const r = await request.post("/api/capture?consent=granted&state=IL&durationS=22&reason=Cough", { headers: { "content-type": "audio/wav" }, data: wav });
  expect(r.status()).toBe(202);
  const { encounterId, statusUrl } = await r.json();
  await expect.poll(async () => (await (await request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  return encounterId as string;
}

async function signTop(page: Page) {
  await page.getByTestId("stack-approve").click();
  const toast = page.getByTestId("stack-toast");
  const force = page.getByTestId("stack-force");
  await expect(toast.or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("Signed");
}

test("the stack opens on the focused visit, shows the whole note, and signs it on screen", async ({ page }) => {
  await register(page);
  const first = await record(page.request);
  const second = await record(page.request);
  await page.goto(`/go/stack?focus=${second}`);
  const card = page.getByTestId("stack-card");
  await expect(card).toHaveAttribute("data-kind", "note.sign");
  await expect(page.getByTestId("stack-note")).toContainText(/cough/i);
  await signTop(page);
  await expect((await (await page.request.get(`/api/capture/${second}`)).json()).status).toBe("signed");
  const decisions = await (await page.request.get("/api/decisions?kinds=note.sign")).json();
  expect(decisions.decisions.map((d: { encounterId: string }) => d.encounterId)).toContain(first);
  expect(decisions.decisions.map((d: { encounterId: string }) => d.encounterId)).not.toContain(second);
});

test("swiping left snoozes a card and swiping right signs", async ({ page }) => {
  await register(page);
  const later = await record(page.request);
  const now = await record(page.request);
  const swipe = async (dx: number) => {
    const box = (await page.getByTestId("stack-title").boundingBox())!;
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
    await page.mouse.up();
  };
  await page.goto(`/go/stack?focus=${later}`);
  await expect(page.getByTestId("stack-note")).toBeVisible();
  await swipe(-220);
  await expect(page.getByTestId("stack-toast")).toContainText("Snoozed");
  const after = await (await page.request.get("/api/decisions?kinds=note.sign")).json();
  expect(after.decisions.some((d: { encounterId: string }) => d.encounterId === later)).toBe(false);
  await page.goto(`/go/stack?focus=${now}`);
  await expect(page.getByTestId("stack-note")).toBeVisible();
  await swipe(220);
  const force = page.getByTestId("stack-force");
  await expect(page.getByTestId("stack-toast").or(force)).toBeVisible();
  if (await force.isVisible()) await force.click();
  await expect(page.getByTestId("stack-toast")).toContainText("Signed");
  expect((await (await page.request.get(`/api/capture/${now}`)).json()).status).toBe("signed");
});

test("a guest sees the claim banner, can't sign until saving, then signs", async ({ page }) => {
  expect((await page.request.post("/api/auth/try")).status()).toBe(201);
  const enc = await record(page.request);
  await page.goto(`/go/stack?focus=${enc}`);
  await expect(page.getByTestId("claim-banner")).toBeVisible();
  await expect(page.getByTestId("stack-approve")).toBeDisabled();
  const email = `stack-guest-${Date.now()}@clinic.test`;
  await page.getByTestId("claim-email").fill(email);
  await page.getByTestId("claim-send").click();
  await expect(page.getByTestId("claim-code")).toBeVisible();
  const inbox = async () => (await (await page.request.get(`http://localhost:3295/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
  await expect.poll(async () => (await inbox()).length).toBe(1);
  await page.getByTestId("claim-code").fill(/\b(\d{6})\b/.exec((await inbox())[0].body)![1]);
  await page.getByTestId("claim-verify").click();
  await expect(page.getByTestId("claim-banner")).toBeHidden();
  await expect(page.getByTestId("stack-card")).toHaveAttribute("data-kind", "note.sign");
  await signTop(page);
});

test("the stack sends signed-out visitors to sign in and back", async ({ page }) => {
  await page.goto("/go/stack?focus=enc_x");
  await expect(page).toHaveURL(/\/login\?next=%2Fgo%2Fstack%3Ffocus%3Denc_x$/);
});

test("the stack and the magic-link page have no serious or critical WCAG 2.1 AA violations", async ({ page }) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  const scan = async (label: string) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect((await page.request.post("/api/auth/try")).status()).toBe(201);
  const enc = await record(page.request);
  await page.goto(`/go/stack?focus=${enc}`);
  await expect(page.getByTestId("stack-note")).toBeVisible();
  const problems = await scan("stack");
  await page.getByTestId("stack-later").click();
  await expect(page.getByTestId("stack-toast")).toBeVisible();
  problems.push(...(await scan("stack-after")));
  const email = `a11y-${Date.now()}@clinic.test`;
  await page.request.post("/api/auth/magic", { data: { email } });
  const inbox = async () => (await (await page.request.get(`http://localhost:3295/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
  await expect.poll(async () => (await inbox()).length).toBe(1);
  await page.goto(/http\S+\/m\/[A-Za-z0-9_-]+/.exec((await inbox())[0].body)![0]);
  await expect(page.getByTestId("magic-continue")).toBeVisible();
  problems.push(...(await scan("magic")));
  expect(problems).toEqual([]);
});
