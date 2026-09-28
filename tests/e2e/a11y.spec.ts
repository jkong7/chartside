import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register, signNote } from "./helpers";

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

test("patient-facing pages have no serious or critical WCAG 2.1 AA violations", async ({ page, browser }) => {
  const problems: string[] = [];
  await register(page);
  await openVisit(page, "Maria Gonzalez");
  await page.getByTestId("intake-create").click();
  const intake = (await page.getByTestId("intake-link").textContent())!.trim();
  await consentAndSimulate(page);
  await draftNote(page);
  await signNote(page);
  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await page.getByTestId("share").click();
  const share = (await page.getByTestId("share-link").getAttribute("href"))!;
  await page.getByTestId("checkin-days").selectOption("0");
  await page.getByTestId("checkin-schedule").click();
  const checkin = (await page.getByTestId("checkin-link").getAttribute("href"))!;
  const patient = await (await browser.newContext()).newPage();
  for (const [label, url] of [["summary", share], ["intake", intake], ["check-in", checkin]] as const) {
    await patient.goto(url);
    await patient.waitForLoadState("networkidle");
    problems.push(...(await scan(patient, label)));
  }
  expect(problems).toEqual([]);
});
