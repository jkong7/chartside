import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("the growth panel shows an invite loop from click to signup, and receipt views as exposures", async ({ page, browser }) => {
  await register(page, "Dr. Grower");
  const { referral } = await (await page.request.get("/api/growth")).json();
  expect(referral.url).toMatch(/\?src=invite$/);

  const friend = await (await browser.newContext()).newPage();
  const hop = await friend.request.get(new URL(referral.url).pathname + new URL(referral.url).search, { maxRedirects: 0 });
  expect(hop.status()).toBe(303);
  expect(hop.headers()["location"]).toMatch(/\/line\?ref=[a-z0-9]{6}&src=invite$/);
  await friend.request.get(new URL(referral.url).pathname + new URL(referral.url).search, { maxRedirects: 0 });
  await register(friend, "Dr. Recruited");

  const { url } = await (await page.request.post("/api/growth/receipt")).json();
  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(new URL(url).pathname);
  await expect(viewer.getByTestId("receipt-cta")).toHaveAttribute("href", /^\/r\/[a-z0-9]{6}\?src=receipt$/);

  await page.goto("/admin?tab=growth");
  const panel = page.getByTestId("growth-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-loop="invite"]')).toContainText("Invite after 3rd note");
  const cells = await panel.locator('[data-loop="invite"] td').allTextContents();
  expect(cells.slice(1)).toEqual(["0", "1", "1", "0"]);
  const receiptCells = await panel.locator('[data-loop="receipt"] td').allTextContents();
  expect(Number(receiptCells[1])).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("growth-k")).toContainText("1.00");
  const r = await new AxeBuilder({ page }).include('[data-testid="growth-panel"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  const metrics = await (await page.request.get("/api/admin/growth")).json();
  expect(metrics.scope).toBe("org");
  expect((await page.request.get("/api/admin/growth?scope=all")).ok()).toBe(true);
  expect((await (await page.request.get("/api/admin/growth?scope=all")).json()).scope).toBe("org");
  expect(JSON.stringify(metrics)).not.toMatch(/James|Carter|Maria|Gonzalez/);
});

test("a /go guest who saves their note counts as a signup from the web guest loop", async ({ page }) => {
  expect((await page.request.post("/api/auth/try")).status()).toBe(201);
  const email = `webguest-${Date.now()}@clinic.test`;
  await page.request.post("/api/auth/magic", { data: { email } });
  const inbox = async () => (await (await page.request.get(`http://localhost:3295/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
  await expect.poll(async () => (await inbox()).length).toBe(1);
  expect((await page.request.post("/api/auth/magic/verify", { data: { email, code: /\b(\d{6})\b/.exec((await inbox())[0].body)![1] } })).ok()).toBe(true);
  const m = await (await page.request.get("/api/admin/growth")).json();
  expect(m.funnel.find((f: { loop: string }) => f.loop === "go_guest")).toMatchObject({ click: 1, signup: 1 });
});
