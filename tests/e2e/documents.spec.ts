import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register } from "./helpers";

test("creates, signs, and shares a letter, and the patient downloads it as a PDF", async ({ page, browser }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);

  await page.getByRole("tab", { name: /Documents/ }).click();
  await expect(page.getByTestId("letters-panel")).toContainText("Referral to: Diabetes education");
  const pdfRef = await page.request.get(page.url().replace(/\/encounters\/([^/?]+).*/, "/api/encounters/$1/documents/referral-0/pdf"));
  expect(pdfRef.headers()["content-type"]).toBe("application/pdf");

  await page.getByTestId("new-document").selectOption({ label: "Letter of medical necessity" });
  await expect(page.getByTestId("document-fields")).toContainText("Letter of medical necessity");
  await expect(page.getByTestId("field-diagnosis")).toHaveValue(/E11/);
  await page.getByTestId("field-item").fill("");
  await page.getByTestId("field-item").blur();
  await expect(page.getByTestId("document-missing")).toContainText("Requested medication, device, or service");
  await page.getByTestId("document-sign").click();
  await expect(page.getByTestId("documents-panel").getByRole("alert")).toContainText("Fill in");
  await page.getByTestId("field-item").fill("Empagliflozin 10 mg daily");
  await page.getByTestId("field-item").blur();
  await expect(page.getByTestId("document-preview")).toContainText("I am writing to request coverage of Empagliflozin 10 mg daily");
  await page.getByTestId("document-sign").click();
  await expect(page.getByTestId("document-signed")).toContainText("Signed by Dr. Avery Chen");
  await page.getByTestId("document-share").click();
  await expect(page.getByTestId("document-row").first()).toContainText("Shared with patient");

  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await page.getByTestId("share").click();
  const href = (await page.getByTestId("share-link").getAttribute("href"))!;
  const ctx = await browser.newContext();
  const patient = await ctx.newPage();
  await patient.goto(href);
  const link = patient.getByTestId("patient-documents").getByRole("link", { name: "Letter of medical necessity" });
  await expect(link).toBeVisible();
  const res = await patient.request.get((await link.getAttribute("href"))!);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 8).toString()).toBe("%PDF-1.4");
  await ctx.close();
});
