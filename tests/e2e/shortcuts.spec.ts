import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("keyboard shortcuts: help, go-to navigation, search focus, and sign from the keyboard", async ({ page }) => {
  await register(page);
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcuts-help")).toContainText("Go to Sign queue");
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await page.waitForURL("**/patients");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search patients")).toBeFocused();
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("sign-blockers").or(page.locator("[data-status=signed]").first())).toBeVisible();
});
