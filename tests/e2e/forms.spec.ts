import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

async function fillable() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  ["Patient Name", "Date of Birth", "Diagnosis", "Physician Name", "Restrictions"].forEach((n, i) => form.createTextField(n).addToPage(page, { x: 50, y: 700 - i * 40, width: 300, height: 20 }));
  return Buffer.from(await doc.save());
}

test("PDF forms: admin uploads a fillable PDF, a clinician fills it from a visit and downloads it", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "PDF forms" }).click();
  await page.waitForURL("**/forms");
  await page.getByTestId("form-name").fill("Acme work status form");
  await page.getByTestId("form-file").setInputFiles({ name: "work-status.pdf", mimeType: "application/pdf", buffer: await fillable() });
  await page.getByTestId("form-upload").click();
  const mapping = page.getByTestId("form-mapping");
  await expect(mapping.getByTestId("form-field")).toHaveCount(5);
  await expect(mapping.getByTestId("form-field").filter({ hasText: "Patient Name" }).getByTestId("form-source")).toHaveValue("patient.name");

  await openVisit(page, "Maria Gonzalez");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.getByRole("tab", { name: /Documents/ }).click();
  await page.getByTestId("pdf-forms").getByTestId("pdf-form-open").click();
  const name = page.getByTestId("pdf-form-field").filter({ hasText: "Patient Name" }).locator("input");
  await expect(name).toHaveValue("Maria Gonzalez");
  await page.getByTestId("pdf-form-field").filter({ hasText: "Restrictions" }).locator("input").fill("Seated work only for 1 week");
  const download = page.waitForEvent("download");
  await page.getByTestId("pdf-form-download").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Acme work status form.pdf");
  const bytes = await (await import("node:fs/promises")).readFile((await file.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
