import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("sign queue lists drafted notes with what blocks them and links to review", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Sign queue" }).click();
  await expect(page.getByTestId("queue-empty")).toBeVisible();
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.goto("/queue");
  const row = page.getByTestId("queue-row").filter({ hasText: "James Carter" });
  await expect(row).toBeVisible();
  if (await row.getByTestId("queue-sign").isVisible()) {
    await row.getByTestId("queue-sign").click();
    await expect(page.getByTestId("queue-empty")).toBeVisible();
  } else {
    await expect(row.getByTestId("queue-blockers")).not.toBeEmpty();
    await page.getByTestId("queue-next").click();
    await page.waitForURL("**/encounters/**");
    await expect(page.getByTestId("note-editor")).toBeVisible();
  }
});
