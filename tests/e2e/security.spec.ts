import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { register } from "./helpers";

function totp(secret: string) {
  const B = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let v = 0;
  const bytes: number[] = [];
  for (const c of secret.replace(/\s/g, "")) {
    v = (v << 5) | B.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

test("turns on two-step verification, signs in with a code, and requires it for the organization", async ({ page, browser }) => {
  const email = await register(page);
  await page.goto("/settings");
  await page.getByTestId("mfa-start").click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.replace(/\s/g, "");
  await page.getByTestId("mfa-confirm-code").fill("000000");
  await page.getByTestId("mfa-confirm").click();
  await expect(page.getByTestId("security-card").getByRole("alert")).toContainText("didn't match");
  await page.getByTestId("mfa-confirm-code").fill(totp(secret));
  await page.getByTestId("mfa-confirm").click();
  await expect(page.getByTestId("recovery-codes")).toContainText("Save these recovery codes");
  await page.getByTestId("mfa-done").click();
  await expect(page.getByTestId("mfa-on")).toContainText("10 recovery codes left");
  await expect(page.getByTestId("session")).toHaveCount(1);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await p2.fill("#email", email);
  await p2.fill("#password", "correct-horse-9");
  await p2.click("button[type=submit]");
  await expect(p2.getByTestId("mfa-form")).toBeVisible();
  await p2.getByTestId("mfa-code").fill("123456");
  await p2.getByTestId("mfa-submit").click();
  await expect(p2.getByTestId("mfa-form").getByRole("alert")).toContainText("didn't match");
  await p2.getByTestId("mfa-code").fill(totp(secret));
  await p2.getByTestId("mfa-submit").click();
  await p2.waitForURL("**/today");

  await page.reload();
  await expect(page.getByTestId("session")).toHaveCount(2);
  await page.getByTestId("signout-everywhere").click();
  await expect(page.getByTestId("session")).toHaveCount(1);
  await p2.goto("/inbox");
  await p2.waitForURL("**/login**");
  await ctx.close();

  await page.goto("/admin");
  await page.getByRole("tab", { name: "Security" }).click();
  await page.getByTestId("require-mfa").click();
  await expect(page.getByRole("status")).toContainText("now required");
  await page.getByTestId("idle-minutes").selectOption("15");
  await page.getByTestId("rotate-scim").click();
  await expect(page.getByTestId("scim-token")).toContainText("scim_");

  await page.getByRole("tab", { name: "Members" }).click();
  const member = `mfa-member-${Date.now()}@chartside.test`;
  await page.fill("#invite-email", member);
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!;
  const c3 = await browser.newContext();
  const m = await c3.newPage();
  await m.goto(link);
  await m.fill("#name", "Dr. New Member");
  await m.fill("#password", "correct-horse-9");
  await m.click("button[type=submit]");
  await m.waitForURL("**/mfa-setup");
  await expect(m.getByTestId("mfa-required")).toContainText("requires two-step verification");
  await c3.close();
});
