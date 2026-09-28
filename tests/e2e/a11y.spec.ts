import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

async function scan(page: import("@playwright/test").Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return bad.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("key pages have no serious or critical WCAG 2.1 AA violations", async ({ page }) => {
  const problems: string[] = [];
  await page.goto("/");
  problems.push(...(await scan(page, "landing")));
  await page.goto("/login");
  problems.push(...(await scan(page, "login")));
  await register(page);
  problems.push(...(await scan(page, "today")));
  for (const path of ["/patients", "/inbox", "/hospital", "/ed", "/revenue", "/quality", "/admin", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    problems.push(...(await scan(page, path)));
  }
  await openVisit(page, "James Carter");
  problems.push(...(await scan(page, "pre-visit")));
  await consentAndSimulate(page);
  await draftNote(page);
  problems.push(...(await scan(page, "note")));
  expect(problems).toEqual([]);
});
