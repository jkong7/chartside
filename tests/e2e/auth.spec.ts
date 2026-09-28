import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("landing page explains the product and routes to sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Talk to your patient");
  await page.getByRole("link", { name: "Start a demo clinic day" }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("protected pages redirect to sign in and the API rejects anonymous calls", async ({ page, request }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login$/);
  const res = await request.get("/api/encounters");
  expect(res.status()).toBe(401);
});

test("register seeds a clinic day, then sign out and back in", async ({ page }) => {
  const email = await register(page);
  await expect(page.getByTestId("visit-row")).toHaveCount(8);
  await expect(page.getByTestId("today-summary")).toHaveText("8 scheduled · 0 awaiting review · 0 signed");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.fill("#email", email);
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.locator("form [role=alert]")).toHaveText("Incorrect email or password");
  await page.fill("#password", "correct-horse-9");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/today$/);
});

test("registration validates input", async ({ page }) => {
  await page.goto("/register");
  await page.fill("#name", "Dr. Test");
  await page.fill("#email", "bad@example.com");
  await page.fill("#password", "short");
  await page.locator("#password").evaluate((el) => el.removeAttribute("minlength"));
  await page.click("button[type=submit]");
  await expect(page.locator("form [role=alert]")).toHaveText("Password must be at least 8 characters");
});
