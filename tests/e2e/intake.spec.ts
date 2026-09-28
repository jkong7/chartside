import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("patient completes a pre-visit intake and the brief shows flags and screening credit", async ({ page, browser }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await page.getByTestId("intake-create").click();
  const link = (await page.getByTestId("intake-link").textContent())!;

  const ctx = await browser.newContext();
  const pt = await ctx.newPage();
  await pt.goto(link);
  await expect(pt.getByTestId("intake-form")).toContainText("Hi Maria");
  await pt.getByTestId("intake-reason").fill("My sugars have been high and I'm always thirsty.");
  await pt.getByTestId("intake-meds").locator("label", { hasText: "Stopped" }).nth(1).click();
  const mood = pt.getByTestId("intake-mood");
  await mood.locator("label", { hasText: "More than half the days" }).nth(0).click();
  await mood.locator("label", { hasText: "More than half the days" }).nth(1).click();
  await mood.locator("label", { hasText: "Several days" }).nth(2).click();
  await mood.locator("label", { hasText: "Not at all" }).nth(3).click();
  await pt.getByText("Yes, now").click();
  await pt.getByTestId("need-food").check();
  await pt.getByTestId("intake-submit").click();
  await expect(pt.getByTestId("intake-done")).toContainText("Thank you");
  await ctx.close();

  await page.reload();
  const card = page.getByTestId("intake-card");
  await expect(card).toContainText("My sugars have been high");
  await expect(page.getByTestId("intake-flags")).toContainText("Positive PHQ-2 (4/6)");
  await expect(page.getByTestId("intake-flags")).toContainText("metformin 500 mg twice daily: stopped taking");
  await expect(page.getByTestId("intake-flags")).toContainText("Social needs: food insecurity");
  await expect(page.getByTestId("intake-flags")).toContainText("Current tobacco use");
});

test("saves patient contact info and logs a send attempt when no provider is configured", async ({ page }) => {
  await register(page);
  const pats = (await (await page.request.get("/api/patients")).json()) as { patients: { id: string; name: string }[] };
  const maria = pats.patients.find((p) => p.name === "Maria Gonzalez")!;
  await page.goto(`/patients/${maria.id}`);
  await page.getByTestId("contact-phone").fill("(312) 555-0142");
  await page.getByTestId("contact-save").click();
  await expect(page.getByTestId("contact-phone")).toHaveValue("+13125550142");
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await page.getByTestId("intake-create").click();
  await page.getByTestId("send-intake").click();
  await expect(page.getByTestId("send-intake-status")).toContainText("No SMS provider is configured");
  await page.goto(`/patients/${maria.id}`);
  await expect(page.getByTestId("outbox")).toContainText("intake by sms to +13125550142 · unconfigured");
});
