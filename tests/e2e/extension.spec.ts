import { expect, test } from "@playwright/test";

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
