import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("locations: add sites in admin, filter Today, and set my location", async ({ page }) => {
  await register(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Organization" }).click();
  const card = page.getByTestId("locations");
  for (const [name, addr] of [["North Clinic", "100 N Main St, Evanston, IL"], ["South Clinic", "5 S State St, Chicago, IL"]]) {
    await card.getByTestId("location-name").fill(name);
    await card.getByTestId("location-address").fill(addr);
    await card.getByTestId("location-add").click();
    await expect(card.getByTestId("location-row").filter({ hasText: name })).toBeVisible();
  }
  await page.goto("/today");
  const filter = page.getByTestId("location-filter");
  await expect(filter).toBeVisible();
  await filter.getByTestId("location-select").selectOption({ label: "South Clinic" });
  await page.waitForURL("**/today?loc=**");
  await filter.getByTestId("location-make-default").click();
  await expect(filter).toContainText("Your location");
});
