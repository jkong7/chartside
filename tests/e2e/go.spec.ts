import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { register } from "./helpers";

test("a guest records a visit with one tap and lands on the note", async ({ page }) => {
  await page.goto("/go");
  await expect(page.getByTestId("go")).toHaveAttribute("data-phase", "idle");
  await page.getByTestId("go-start").click();
  await expect(page.getByTestId("go-consent")).toBeVisible();
  await page.getByTestId("go-consent-yes").click();
  await expect(page.getByTestId("go-live")).toBeVisible();
  await expect(page.getByTestId("go-timer")).toHaveText(/0:0[6-9]|0:1\d/, { timeout: 15000 });
  await page.getByTestId("go-pause").click();
  await expect(page.getByTestId("go-live")).toContainText("Paused");
  await page.getByTestId("go-resume").click();
  await page.getByTestId("go-end").click();
  await expect(page.getByTestId("go-ready")).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId("go-review")).toHaveText("Read it and save it");
  await page.getByTestId("go-review").click();
  await page.waitForURL(/\/go\/stack\?focus=enc_/);
  await expect(page.getByTestId("claim-banner")).toBeVisible();
});

test("declining consent records nothing", async ({ page }) => {
  await page.goto("/go");
  await page.getByTestId("go-start").click();
  await page.getByTestId("go-consent-no").click();
  await expect(page.getByTestId("go")).toHaveAttribute("data-phase", "idle");
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(401);
});

test("a signed-in clinician sees what's waiting and records into their own stack", async ({ page }) => {
  await register(page);
  await page.goto("/go");
  await expect(page.getByTestId("go-stack-link")).toContainText("waiting on your stack");
  await page.getByTestId("go-start").click();
  await page.getByTestId("go-consent-yes").click();
  await expect(page.getByTestId("go-timer")).toHaveText(/0:0[6-9]|0:1\d/, { timeout: 15000 });
  await page.getByTestId("go-end").click();
  await expect(page.getByTestId("go-review")).toHaveText("Review and sign", { timeout: 45000 });
  await page.getByTestId("go-review").click();
  await expect(page.getByTestId("stack-card").first()).toBeVisible();
});

test("the browser phone runs a whole call: consent, sample visit, read-back, and the text-back link", async ({ page }) => {
  await page.goto("/go/phone");
  await page.getByTestId("sim-call").click();
  await expect(page.getByTestId("sim-caption")).toContainText("Your first note is free", { timeout: 15000 });
  await expect(page.getByTestId("sim-incall")).toHaveAttribute("data-state", "consent", { timeout: 15000 });
  await page.getByTestId("sim-keypad-toggle").click();
  await page.getByRole("button", { name: "Key 2" }).click();
  await expect(page.getByTestId("sim-incall")).toHaveAttribute("data-state", "recording", { timeout: 15000 });
  await page.getByTestId("sim-keypad-toggle").click();
  await page.getByTestId("sim-sample").click();
  await expect(page.getByTestId("sim-sample-skip")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByTestId("sim-sample-skip").click();
  await page.getByTestId("sim-keypad-toggle").click();
  await page.getByRole("button", { name: "Key 5" }).click();
  await expect(page.getByTestId("sim-incall")).toHaveAttribute("data-state", "review", { timeout: 45000 });
  await expect(page.getByTestId("sim-caption")).toContainText("Here's your note.");
  await page.getByRole("button", { name: "Key 1" }).click();
  await expect(page.getByTestId("sim-ended")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("sim-tab-messages").click();
  await expect(page.getByTestId("sim-text")).toContainText("Tap to save it", { timeout: 15000 });
  const href = await page.getByTestId("sim-text-link").getAttribute("href");
  expect(href).toMatch(/\/m\/[\w-]+$/);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByTestId("sim-share").click();
  await expect(page.getByTestId("sim-shared")).toHaveText("Link copied. Paste it to a colleague.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/Try it: http:\/\/localhost:3200\/line\?src=sim$/);
});

test("autopilot plays a whole call by itself and ends on the text", async ({ page }) => {
  await page.goto("/go/phone?autopilot=1&ff=1");
  await page.getByTestId("sim-call").click();
  await expect(page.getByTestId("sim-autopilot")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("sim-incall")).toHaveAttribute("data-state", "recording", { timeout: 20000 });
  await expect(page.getByTestId("sim-text")).toContainText("Tap to save it", { timeout: 90000 });
  await expect(page.getByTestId("sim-messages")).toBeVisible();
});

test("the line page shows who invited you, offers a contact card, and passes an accessibility scan", async ({ page, browser }) => {
  await register(page, "Dr. Jamie Rivera");
  const g = await (await page.request.get("/api/growth")).json();
  const code = /\/r\/([a-z0-9]{6})/.exec(JSON.stringify(g))![1];
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/r/${code}`);
  await visitor.waitForURL(/\/line\?ref=/);
  await expect(visitor.getByTestId("line-invited")).toContainText("Dr. Rivera invited you");
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText("Your scribe is");
  await expect(visitor.getByTestId("line-watch")).toHaveAttribute("href", "/go/phone?autopilot=1");
  await visitor.getByText("Can someone call my line pretending to be me?").click();
  await expect(visitor.getByTestId("line-faq")).toContainText("Caller ID can be faked");
  await expect(visitor.getByTestId("line-video").locator("video")).toHaveAttribute("src", "/demo/line-call.mp4");
  expect((await visitor.request.get("/demo/line-call.mp4")).headers()["content-type"]).toContain("video/mp4");
  const vcf = await visitor.request.get("/line/contact.vcf");
  expect(vcf.headers()["content-type"]).toContain("text/vcard");
  expect(await vcf.text()).toContain("FN:Chartside Scribe");
  await visitor.goto("/line?src=recap");
  await expect(visitor.getByTestId("line-recap")).toBeVisible();
  const scan = await new AxeBuilder({ page: visitor }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(scan.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target} ${n.any[0]?.message ?? ""}`))).toEqual([]);
  await visitor.goto("/go/phone");
  const phoneScan = await new AxeBuilder({ page: visitor }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(phoneScan.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("sharing a recording from another app asks for consent before anything is kept", async ({ page }) => {
  const { readFileSync } = await import("node:fs");
  const wav = readFileSync("tests/e2e/fixtures/visit.wav");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.share_target).toMatchObject({ action: "/go/share", method: "POST", enctype: "multipart/form-data" });
  await page.goto("/go");
  const up = await page.request.post("/go/share", { multipart: { audio: { name: "Recording 14.m4a", mimeType: "audio/mp4", buffer: wav } }, maxRedirects: 0 });
  expect(up.status()).toBe(303);
  const where = up.headers().location;
  expect(where).toMatch(/\/go\/share\/confirm\?t=/);
  await page.goto(where);
  await expect(page.getByTestId("share-confirm")).toContainText("Recording 14.m4a");
  await page.getByTestId("share-yes").click();
  await expect(page.getByTestId("share-review")).toBeVisible({ timeout: 45000 });
  await page.getByTestId("share-review").click();
  await page.waitForURL(/\/go\/stack\?focus=enc_/);
  await page.goto(where);
  await expect(page.getByTestId("share-expired")).toBeVisible();

  const again = await page.request.post("/go/share", { multipart: { audio: { name: "Recording 15.m4a", mimeType: "audio/mp4", buffer: wav } }, maxRedirects: 0 });
  await page.goto(again.headers().location);
  await page.getByTestId("share-no").click();
  await expect(page.getByTestId("share-discarded")).toBeVisible();
  const other = await (await page.context().browser()!.newContext()).newPage();
  await other.goto(again.headers().location);
  await expect(other.getByTestId("share-expired")).toBeVisible();
  const bad = await page.request.post("/go/share", { multipart: { audio: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } }, maxRedirects: 0 });
  expect(bad.headers().location).toContain("/go?shared=");
});
