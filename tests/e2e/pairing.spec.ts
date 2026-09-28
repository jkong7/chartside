import { expect, test } from "@playwright/test";
import { openVisit, register } from "./helpers";

test("record on phone: QR pairing opens the same visit on a signed-in phone, single use", async ({ page, browser }) => {
  const email = await register(page);
  await openVisit(page, "James Carter");
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await page.getByTestId("pair-phone").click();
  await expect(page.getByTestId("pair-qr").locator("svg")).toBeVisible();
  const link = (await page.getByTestId("pair-link").getAttribute("href"))!;
  const encId = page.url().split("/encounters/")[1].split("?")[0];

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).newPage();
  await phone.goto(link);
  await phone.waitForURL("**/login?next=**");
  await phone.fill("#email", email);
  await phone.fill("#password", "correct-horse-9");
  await phone.click("button[type=submit]");
  await phone.waitForURL(`**/encounters/${encId}?device=phone`);
  await expect(page.getByTestId("pair-connected")).toBeVisible();

  await phone.getByTestId("start-simulate").click();
  await phone.getByLabel("Playback speed").selectOption("10");
  await expect(phone.getByTestId("sim-done")).toBeVisible({ timeout: 60_000 });
  await phone.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });

  await phone.goto(link);
  await expect(phone.getByTestId("pair-error")).toContainText("already used");
});
