import { expect, test } from "@playwright/test";
import { consentAndSimulate, openVisit, register } from "./helpers";

test("visit agenda: prioritized before the visit and checked off live as topics come up", async ({ page }) => {
  await register(page);
  await openVisit(page, "Maria Gonzalez");
  const agenda = page.getByTestId("agenda");
  await expect(agenda).toContainText("Review Hemoglobin A1c 8.4 %");
  await expect(agenda).toContainText("Close the loop: Home BP log");
  await expect(agenda).toContainText("Assess for chronic kidney disease stage 3a (N18.31)");
  await expect(page.getByTestId("agenda-progress")).toContainText("0 of");
  await consentAndSimulate(page);
  const live = page.getByTestId("coverage").getByTestId("agenda");
  await expect(live.getByTestId("agenda-item").filter({ hasText: "Hemoglobin A1c" }).locator("p").first()).toHaveClass(/line-through/);
  const home = live.getByTestId("agenda-item").filter({ hasText: "Home BP log" });
  await home.getByTestId("agenda-toggle").click();
  await expect(home.locator("p").first()).toHaveClass(/line-through/);
});
