import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("impact dashboard reports adoption, time, revenue integrity, quality, and messaging", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Impact" }).click();
  await page.waitForURL("**/impact");
  await expect(page.getByTestId("impact-adoption")).toContainText("Visits with ambient capture");
  await expect(page.getByTestId("impact-clinicians")).toContainText("Dr. Avery Chen");
  await expect(page.getByTestId("impact-revenue")).toContainText("Add-on codes captured");
  await expect(page.getByTestId("em-mix")).toContainText("9921");
  await expect(page.getByTestId("impact-messages")).toContainText("received");
  await page.getByRole("radio", { name: "90 days" }).click();
  await page.waitForURL("**/impact?days=90**");
  await expect(page.getByRole("radio", { name: "90 days" })).toHaveAttribute("aria-checked", "true");

  await page.goto("/today");
  const survey = page.getByTestId("survey");
  if (await survey.isVisible()) {
    await page.getByTestId("survey-9").click();
    await page.getByTestId("survey-comment").fill("Notes are ready before I leave the room");
    await page.getByTestId("survey-submit").click();
    await expect(page.getByTestId("survey-done")).toBeVisible();
  } else {
    expect((await page.request.post("/api/survey", { data: { score: 9, comment: "Notes are ready before I leave the room" } })).ok()).toBe(true);
  }
  await page.goto("/impact");
  await expect(page.getByTestId("impact-nps")).toContainText("1 responses");
  await expect(page.getByTestId("impact-nps")).toContainText("Notes are ready before I leave the room");
  await expect(page.getByTestId("impact-nudges")).toBeVisible();
});
