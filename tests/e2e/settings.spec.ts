import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import { register } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");

test.use({ viewport: { width: 390, height: 844 } });

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("settings verifies a phone by text, sets a PIN, claims an NPI, and shares a receipt", async ({ page }) => {
  await register(page, "Dr. Dana Ruiz");
  await page.goto("/go/stack");
  await page.getByTestId("stack-settings").click();
  await expect(page.getByTestId("go-settings")).toHaveAttribute("data-ready", "true");
  const problems = await axe(page, "settings");

  const phone = `312555${String(Date.now()).slice(-4)}`;
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("phone-send").click();
  await expect(page.getByTestId("settings-phone")).toContainText("Code sent to");
  const texts = async () => (await (await page.request.get(`http://localhost:3295/texts?to=${encodeURIComponent(`+1${phone}`)}`)).json()) as { body: string }[];
  await expect.poll(async () => (await texts()).length).toBe(1);
  const body = (await texts())[0].body;
  expect(body).not.toMatch(/Dana|Ruiz/);
  await page.getByTestId("phone-code").fill(/\b(\d{6})\b/.exec(body)![1]);
  await page.getByTestId("phone-verify").click();
  await expect(page.getByTestId("phone-current")).toHaveText(new RegExp(`${phone.slice(-4)}$`));

  await expect(page.getByTestId("pin-status")).toHaveText("No PIN yet.");
  await page.getByTestId("pin-input").fill("1234");
  await page.getByTestId("pin-save").click();
  await expect(page.getByTestId("settings-pin").getByRole("alert")).toContainText("digits in a row");
  await page.getByTestId("pin-input").fill("4821");
  await page.getByTestId("pin-save").click();
  await expect(page.getByTestId("pin-status")).toHaveText("A PIN is set.");
  expect((await (await page.request.get("/api/auth/phone/pin")).json()).set).toBe(true);

  await page.getByTestId("npi-input").fill("1245319599");
  await page.getByTestId("npi-state").fill("CA");
  await page.getByTestId("npi-save").click();
  await expect(page.getByTestId("npi-status")).toContainText("NPI 1245319599 on file");

  await page.getByTestId("receipt-create").click();
  await expect(page.getByTestId("receipt-link")).toContainText("/receipt/");
  await expect(page.getByTestId("referral-url")).toHaveText(/\/r\/[a-z0-9]{6}\?src=invite$/);
  await expect(page.getByTestId("credits")).toContainText("0 free months");
  problems.push(...(await axe(page, "settings-after")));
  expect(problems).toEqual([]);
});

test("the iPhone Shortcut path: a 30-day key uploads a Voice Memo, then the key is disconnected", async ({ page, baseURL }) => {
  await register(page, "Dr. Shortcut");
  await page.goto("/go/shortcut");
  await expect(page.getByTestId("shortcut-setup")).toHaveAttribute("data-ready", "true");
  const problems = await axe(page, "shortcut");
  await expect(page.getByTestId("shortcut-url")).toContainText("/api/capture?consent=granted&state=IL&channel=shortcut");
  await page.getByTestId("shortcut-mint").click();
  const token = (await page.getByTestId("shortcut-token").textContent())!.trim();
  expect(token).toMatch(/^cs_cap_/);
  await expect(page.getByTestId("shortcut-curl")).toContainText(`Bearer ${token}`);
  problems.push(...(await axe(page, "shortcut-minted")));
  expect(problems).toEqual([]);

  const phone = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  const up = await phone.post("/api/capture?consent=granted&state=IL&channel=shortcut", { multipart: { audio: { name: "Visit 12.m4a", mimeType: "application/octet-stream", buffer: wav } } });
  expect(up.status()).toBe(202);
  const { encounterId, statusUrl } = await up.json();
  await expect.poll(async () => (await (await phone.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  expect((await phone.get("/api/encounters")).status()).toBe(401);

  await page.goto(`/go/stack?focus=${encounterId}`);
  await expect(page.getByTestId("stack-note")).toBeVisible();

  await page.goto("/go/settings");
  await expect(page.getByTestId("go-settings")).toHaveAttribute("data-ready", "true");
  const row = page.getByTestId("device-row").filter({ hasText: "iPhone Shortcut" });
  await expect(row).toContainText(/Last used/);
  await row.getByTestId("device-revoke").click();
  await expect(page.getByTestId("device-row")).toHaveCount(0);
  expect((await phone.get(statusUrl)).status()).toBe(401);
  await phone.dispose();
});
