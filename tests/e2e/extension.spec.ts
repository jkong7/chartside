import { expect, test } from "@playwright/test";
import { passwordSignUp, register } from "./helpers";

const EHR = `<!doctype html><html><body>
<h1>MiniEHR</h1>
<form>
  <label>HPI <textarea id="hpi"></textarea></label>
  <div class="row"><label>Assessment and plan <textarea name="plan_text"></textarea></label></div>
  <div class="grid"><div><div contenteditable="true" class="rich"></div></div><div><div contenteditable="true" class="rich"></div></div></div>
  <input aria-label="Chief complaint" />
</form>
<p id="log"></p>
<script>
  const log = [];
  document.addEventListener("input", (e) => { log.push(e.target.id || e.target.name || e.target.className || e.target.getAttribute("aria-label")); document.getElementById("log").textContent = log.join(","); }, true);
</script>
</body></html>`;

test("extension fills mapped EHR fields with real input events and builds stable selectors", async ({ page }) => {
  await page.setContent(EHR);
  await page.addScriptTag({ path: "extension/lib.js" });
  const sels = await page.evaluate(() => {
    const X = (globalThis as unknown as { ChartsideExt: { cssPath: (e: Element) => string } }).ChartsideExt;
    return [X.cssPath(document.querySelector("#hpi")!), X.cssPath(document.querySelector("textarea[name=plan_text]")!), X.cssPath(document.querySelectorAll(".rich")[1]), X.cssPath(document.querySelector("input")!)];
  });
  expect(sels[0]).toBe("#hpi");
  expect(sels[1]).toBe('textarea[name="plan_text"]');
  expect(sels[3]).toBe('input[aria-label="Chief complaint"]');
  expect(await page.evaluate((s) => document.querySelectorAll(s).length, sels[2])).toBe(1);

  const result = await page.evaluate((s) => (globalThis as unknown as { ChartsideExt: { fill: (m: Record<string, string>, x: unknown[], mode: string) => unknown } }).ChartsideExt.fill({ hpi: s[0], ap: s[1], exam: s[2], cc: s[3] }, [
    { key: "cc", title: "Chief Complaint", text: "Diabetes follow-up" },
    { key: "hpi", title: "HPI", text: "Maria is a 58-year-old woman here for diabetes follow-up." },
    { key: "ap", title: "Assessment & Plan", text: "1. Type 2 diabetes\n   - Increase metformin" },
    { key: "exam", title: "Exam", text: "Lungs clear." },
    { key: "ros", title: "ROS", text: "Negative" },
  ], "replace"), sels);
  expect(result).toEqual([
    { key: "cc", status: "filled", selector: sels[3] },
    { key: "hpi", status: "filled", selector: "#hpi" },
    { key: "ap", status: "filled", selector: sels[1] },
    { key: "exam", status: "filled", selector: sels[2] },
    { key: "ros", status: "unmapped" },
  ]);
  await expect(page.locator("#hpi")).toHaveValue("Maria is a 58-year-old woman here for diabetes follow-up.");
  await expect(page.locator("textarea[name=plan_text]")).toHaveValue("1. Type 2 diabetes\n   - Increase metformin");
  await expect(page.locator(".rich").nth(1)).toHaveText("Lungs clear.");
  await expect(page.locator("#log")).toHaveText("Chief complaint,hpi,plan_text,rich");

  const picked = page.evaluate(() => (globalThis as unknown as { ChartsideExt: { pick: () => Promise<string | null> } }).ChartsideExt.pick());
  await page.locator("textarea[name=plan_text]").click();
  expect(await picked).toBe('textarea[name="plan_text"]');
  const manifest = JSON.parse(await (await import("node:fs/promises")).readFile("extension/manifest.json", "utf8"));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.side_panel.default_path).toBe("sidepanel.html");
});

test("the extension recorder uploads a visit in chunks and waits for the note", async ({ page }) => {
  await register(page);
  await page.goto("/today");
  await page.addScriptTag({ path: "extension/recorder.js" });
  const result = await page.evaluate(async () => {
    const phases: string[] = [];
    const R = (globalThis as unknown as { ChartsideRecorder: new (b: string, cb: (s: { phase: string }) => void, o: object) => { start(): Promise<void>; stop(): Promise<string>; pause(): void; resume(): void; seconds(): number } }).ChartsideRecorder;
    const r = new R(location.origin, (s) => phases.push(s.phase), { timeslice: 1000, pollMs: 400 });
    await r.start();
    await new Promise((res) => setTimeout(res, 2500));
    r.pause();
    await new Promise((res) => setTimeout(res, 800));
    r.resume();
    await new Promise((res) => setTimeout(res, 2500));
    const id = await r.stop();
    return { id, phases, secs: r.seconds() };
  });
  expect(result.id).toMatch(/^enc_/);
  expect(result.phases).toEqual(["recording", "paused", "recording", "finishing", "ready"]);
  expect(result.secs).toBeGreaterThanOrEqual(4);
  const note = await (await page.request.get(`/api/capture/${result.id}/note`)).json();
  expect(note.sections.length).toBeGreaterThan(1);
  const origin = await (await page.request.get(`/api/capture/${result.id}`)).json();
  expect(origin.status).toBe("ready");
});

test("the unpacked extension records from its side panel and opens the finished note", async ({ baseURL }) => {
  const { chromium } = await import("@playwright/test");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const ext = path.resolve("extension");
  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "cs-ext-")), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=tests/e2e/fixtures/visit.wav"],
    permissions: ["microphone"],
  });
  try {
    const page = await ctx.newPage();
    page.context().setDefaultTimeout(20000);
    await page.goto(`${baseURL}/login`);
    await passwordSignUp(page, { name: "Dr. Ext Tester", email: `ext-${Date.now()}@chartside.test`, password: "correct-horse-9", demo: true }, baseURL);
    await page.goto(`${baseURL}/today`);
    const isExt = (w: { url(): string }) => w.url().startsWith("chrome-extension://");
    const worker = ctx.serviceWorkers().find(isExt) ?? (await ctx.waitForEvent("serviceworker", { predicate: isExt }));
    const id = new URL(worker.url()).host;
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.fill("#base", baseURL!);
    await panel.click("#save");
    await panel.click("#rec-start");
    await panel.click("#rec-yes");
    await expect(panel.locator("#rec-timer")).toHaveText(/0:0[6-9]/, { timeout: 20000 });
    await panel.click("#rec-end");
    await expect(panel.locator("#detail")).toBeVisible({ timeout: 45000 });
    await expect(panel.locator("#detail")).toContainText(/cough/i);
    await expect(panel.locator("#detail a")).toHaveAttribute("href", /\/go\/stack\?focus=enc_/);
  } finally {
    await ctx.close();
  }
});
