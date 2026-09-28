import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("revenue cycle: official pricing, cited edits, approve, clearinghouse acceptance, ERA posting, 837P, prior auth", async ({ page }) => {
  await register(page);
  await openVisit(page, "Ana Morales");
  await consentAndSimulate(page);
  await draftNote(page);

  await page.getByRole("tab", { name: /Codes/ }).click();
  await expect(page.getByTestId("icd-release")).toHaveText(/FY20(26-April|27) release/);
  await expect(page.locator("[data-testid=dx-row][data-code='J44.9'] [data-testid=dx-official]")).toHaveText("Chronic obstructive pulmonary disease, unspecified");
  await expect(page.locator("[data-testid=dx-row][data-code='J44.9'] [data-testid=dx-hcc]")).toContainText("HCC280");
  await expect(page.getByTestId("raf")).not.toHaveText("0.000");
  await expect(page.getByTestId("coding-reference")).toContainText("RVU26D");

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
  const em = page.locator("[data-testid=claim-line][data-cpt='99214']");
  await expect(em).toContainText("25");
  await expect(em.getByTestId("line-allowed")).toHaveText("$142.45");
  await expect(em.getByTestId("line-basis")).toHaveText("MPFS · A");
  await expect(page.locator("[data-testid=claim-line][data-cpt='90677'] [data-testid=line-allowed]")).toHaveText("$361.42");
  await expect(page.locator("[data-testid=claim-line][data-cpt='90677'] [data-testid=line-basis]")).toHaveText("ASP");
  await expect(page.locator("[data-testid=claim-line][data-cpt=G0009] [data-testid=line-allowed]")).toHaveText("$36.63");
  await expect(page.locator("[data-testid=claim-line][data-cpt='90471']")).toHaveCount(0);
  await expect(page.locator("[data-testid=claim-line][data-cpt=G2211]")).toBeVisible();
  await expect(page.getByTestId("claim-total")).toHaveText("$1100.00");
  await expect(page.getByTestId("claim-reference")).toContainText("Chicago".toUpperCase());

  await page.getByTestId("edit-lines").click();
  await em.getByLabel("Modifiers").fill("");
  await page.getByTestId("save-lines").click();
  const mod = page.getByTestId("claim-edits").locator("li").filter({ hasText: "needs modifier 25" });
  await expect(mod.getByTestId("edit-source")).toContainText("NCCI Policy Manual Ch. XI");
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "needs_review");
  await expect(page.getByTestId("claim-approve")).toBeDisabled();
  await page.getByTestId("edit-lines").click();
  await em.getByLabel("Modifiers").fill("25");
  await page.getByTestId("save-lines").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "ready");

  await page.getByTestId("claim-approve").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "approved");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "accepted");
  await expect(page.getByTestId("claim-lifecycle")).toContainText("control number TRN");
  await expect(page.getByTestId("edit-lines")).toHaveCount(0);

  await page.getByTestId("claim-era").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "paid");
  const remit = page.getByTestId("remit");
  await expect(remit).toContainText("Electronic remittance (ERA)");
  await expect(remit.locator("[data-testid=remit-line]").first()).toContainText("CO-45");
  await expect(page.getByTestId("claim-paid")).not.toHaveText("$0.00");

  const edi = await (await page.request.get(page.url().split("?")[0].replace("/encounters/", "/api/encounters/") + "/claim/837")).text();
  expect(edi).toContain("SV1*HC:99214:25*272.00");
  expect(edi).toContain("SV1*HC:G0009");
  expect(edi).toContain("HI*ABK:J449*ABF:Z23~");

  await page.goto("/revenue");
  await expect(page.getByTestId("rcm-kpis")).toContainText("First-pass resolution");
  const row = page.getByTestId("claim-row").filter({ hasText: "Ana Morales" });
  await expect(row).toContainText("Paid");
  await page.getByRole("tab", { name: /Prior authorizations/ }).click();
  await expect(page.getByTestId("pa-worklist")).toContainText("Tiotropium");
});

test("seeded lifecycle: denials worklist, appeal, A/R aging, and missed revenue", async ({ page }) => {
  await register(page);
  await page.goto("/revenue");
  const queue = page.getByTestId("claims-queue");
  await expect(page.getByTestId("claim-row")).toHaveCount(11);
  await expect(queue).toContainText("Paid");
  await expect(queue).toContainText("Denied");
  await expect(queue).toContainText("On hold");
  await expect(queue).toContainText("Accepted · awaiting payment");

  await page.getByRole("tab", { name: /Denials/ }).click();
  const denial = page.getByTestId("denial-row").filter({ hasText: "Elena Russo" });
  await expect(denial.getByTestId("denial-category")).toHaveText("coding");
  await expect(denial).toContainText("11");
  await page.getByRole("tab", { name: "A/R aging" }).click();
  await expect(page.getByTestId("aging-bucket")).toHaveCount(5);
  await page.getByRole("tab", { name: "Missed revenue" }).click();
  await expect(page.getByTestId("leakage")).toContainText("Add-on codes (G2211)");

  await page.getByRole("tab", { name: /Denials/ }).click();
  await denial.getByRole("link").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "denied");
  await page.getByTestId("claim-appeal").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "appealed");
  await page.getByTestId("appeal").getByRole("button", { name: "View letter" }).click();
  await expect(page.getByTestId("appeal-letter")).toContainText("Request for redetermination");
  await expect(page.getByTestId("appeal-letter")).toContainText("CO-11");
  await page.getByTestId("appeal-won").click();
  await expect(page.getByTestId("claim-status")).toHaveAttribute("data-claim-status", "paid");
  await expect(page.getByTestId("remit")).toHaveCount(2);

  await page.goto("/revenue");
  await page.getByRole("button", { name: "on hold" }).click();
  await expect(page.getByTestId("claim-row")).toHaveCount(1);
  await page.getByRole("button", { name: "All" }).click();
  await page.getByTestId("claim-row").filter({ hasText: "Owen Carter" }).getByRole("link").click();
  await expect(page.getByTestId("billing-panel")).toBeVisible();
  const opp = page.getByTestId("opportunity").filter({ hasText: "96127" });
  await expect(opp).toBeVisible();
  await expect(opp.getByTestId("add-opportunity")).toHaveCount(0);
});

test("CDI query: official specificity options are answered by the clinician and flow to the note and claim", async ({ page }) => {
  await register(page);
  await openVisit(page, "Priya Shah");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.getByRole("tab", { name: /Codes/ }).click();
  const q = page.getByTestId("cdi-query").first();
  await expect(q).toContainText("Based on your clinical judgment");
  await expect(q.getByRole("radio")).not.toHaveCount(0);
  await expect(q.getByRole("radio", { checked: true })).toHaveCount(0);
  const option = q.locator("label").filter({ hasText: /left/i }).first();
  const code = (await option.locator("span.font-mono").textContent())!.trim();
  await option.getByRole("radio").check();
  await q.getByTestId("answer-query").click();
  await expect(page.locator(`[data-testid=dx-row][data-code='${code}']`)).toBeVisible();
  await page.getByRole("tab", { name: /Billing/ }).click();
  await expect(page.getByTestId("billing-panel")).toContainText(code);
  await page.getByRole("tab", { name: "Note" }).click();
  await expect(page.getByTestId("note-editor")).toContainText(`Clarified diagnosis:`);
  await expect(page.getByTestId("note-editor")).toContainText(code);
});

test("admin sets the Medicare locality and billing identifiers and sees code-set provenance", async ({ page }) => {
  await register(page);
  await page.goto("/admin?tab=billing");
  await expect(page.getByTestId("demo-identifiers")).toBeVisible();
  await expect(page.getByTestId("codeset-row")).toHaveCount(8);
  await expect(page.getByTestId("codeset-status")).toContainText("ICD-10-CM FY2027");
  await expect(page.getByTestId("codeset-status")).toContainText("ftp.cdc.gov");
  await expect(page.getByTestId("licensed-status")).toContainText("Not loaded");
  await page.fill("#b-npi", "1234567890");
  await page.getByTestId("billing-save").click();
  await expect(page.locator("[data-testid=billing-form] [role=alert]")).toContainText("check-digit");
  await page.fill("#b-npi", "1234567893");
  await page.selectOption("#b-loc", { label: "AL · ALABAMA (MAC 10112)" });
  await page.getByTestId("billing-save").click();
  await expect(page.getByText("Billing settings saved.")).toBeVisible();
  await expect(page.getByTestId("demo-identifiers")).toHaveCount(0);
});
