import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("revenue cycle: draft claim, sign, fix a claim edit, approve, submit, 837P, prior auth", async ({ page }) => {
  await register(page);
  await openVisit(page, "Ana Morales");
  await consentAndSimulate(page);
  await draftNote(page);

  await page.getByRole("tab", { name: /Billing/ }).click();
  await expect(page.getByTestId("claim-status")).toHaveText("Draft (finalized at signing)");
  const pa = page.getByTestId("pa-packet");
  await expect(pa).toContainText("Tiotropium");
  await expect(pa.getByTestId("pa-status")).toHaveText("Criteria met");
  await pa.getByRole("button", { name: "View medical necessity letter" }).click();
  await expect(pa.getByTestId("pa-letter")).toContainText("Re: Prior authorization request for Tiotropium");
  await pa.getByTestId("pa-submit").click();
  await expect(pa.getByTestId("pa-submission")).toHaveText("submitted");

  await page.getByRole("tab", { name: /Orders/ }).click();
  await page.getByTestId("accept-safe").click();
  await expect(page.locator("[data-testid=order-row][data-status=staged]")).toHaveCount(0);
  await page.getByRole("tab", { name: "Note" }).click();
  await page.getByTestId("sign").click();
  const anyway = page.getByTestId("sign-anyway");
  await expect(anyway.or(page.locator("[data-status=signed]").first())).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(page.locator("[data-status=signed]").first()).toBeVisible();

  await page.getByRole("tab", { name: /Billing/ }).click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "ready");
  await expect(page.getByTestId("claim-total")).toHaveText("$427.00");
  await expect(page.locator("[data-testid=claim-line][data-cpt=G2211]")).toBeVisible();
  await expect(page.locator("[data-testid=claim-line][data-cpt='99214']")).toContainText("25");

  await page.getByTestId("edit-lines").click();
  await page.locator("[data-testid=claim-line][data-cpt='99214']").getByLabel("Modifiers").fill("");
  await page.getByTestId("save-lines").click();
  await expect(page.getByTestId("claim-edits")).toContainText("needs modifier 25");
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "needs_review");
  await expect(page.getByTestId("claim-approve")).toBeDisabled();
  await page.getByTestId("edit-lines").click();
  await page.locator("[data-testid=claim-line][data-cpt='99214']").getByLabel("Modifiers").fill("25");
  await page.getByTestId("save-lines").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "ready");

  await page.getByTestId("claim-approve").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "approved");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "submitted");
  await expect(page.getByTestId("edit-lines")).toHaveCount(0);

  const edi = await (await page.request.get(page.url().split("?")[0].replace("/encounters/", "/api/encounters/") + "/claim/837")).text();
  expect(edi).toContain("CLM*");
  expect(edi).toContain("SV1*HC:99214:25*132.00");
  expect(edi).toContain("SV1*HC:90677");
  expect(edi).toContain("HI*ABK:J449*ABF:Z23~");

  await page.goto("/revenue");
  await expect(page.getByTestId("revenue-kpis")).toContainText("Submitted");
  const row = page.getByTestId("claim-row").filter({ hasText: "Ana Morales" });
  await expect(row).toContainText("Submitted");
  await expect(row).toContainText("$427.00");
  await page.getByRole("tab", { name: /Prior authorizations/ }).click();
  await expect(page.getByTestId("pa-worklist")).toContainText("Tiotropium");
});

test("revenue page shows seeded queue statuses and missed revenue; adding an opportunity updates the claim", async ({ page }) => {
  await register(page);
  await page.goto("/revenue");
  const queue = page.getByTestId("claims-queue");
  await expect(page.getByTestId("claim-row")).toHaveCount(9);
  await expect(queue).toContainText("Submitted");
  await expect(queue).toContainText("On hold");
  await page.getByRole("tab", { name: "Missed revenue" }).click();
  await expect(page.getByTestId("leakage")).toContainText("Add-on codes (G2211)");
  await expect(page.getByTestId("leakage")).toContainText("Screening instruments");

  await page.getByRole("tab", { name: /Claims queue/ }).click();
  await page.getByRole("button", { name: "on hold" }).click();
  await expect(page.getByTestId("claim-row")).toHaveCount(1);
  await page.getByRole("button", { name: "All" }).click();
  await page.getByTestId("claim-row").filter({ hasText: "Owen Carter" }).getByRole("link").click();
  await expect(page.getByTestId("billing-panel")).toBeVisible();
  const before = await page.getByTestId("claim-total").textContent();
  const opp = page.getByTestId("opportunity").filter({ hasText: "96127" });
  await expect(opp).toBeVisible();
  await expect(opp.getByTestId("add-opportunity")).toHaveCount(0);
  const g = page.getByTestId("opportunity").filter({ hasText: "G2211" });
  if (await g.count()) {
    await g.getByTestId("add-opportunity").click();
    await expect(page.getByTestId("claim-total")).not.toHaveText(before!);
  }
});
