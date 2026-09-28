import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("installs as an app: manifest, icons, service worker, and offline page", async ({ page }) => {
  const m = await (await page.request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "Chartside", start_url: "/today", display: "standalone", theme_color: "#0f6b5c" });
  for (const icon of m.icons) expect((await page.request.get(icon.src)).status()).toBe(200);
  expect(await (await page.request.get("/offline.html")).text()).toContain("You're offline");
  await register(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f6b5c");
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active)).toBe(true);
  await page.context().setOffline(true);
  await page.goto("/today").catch(() => undefined);
  await expect(page.getByText("You're offline")).toBeVisible();
  await page.context().setOffline(false);
});
