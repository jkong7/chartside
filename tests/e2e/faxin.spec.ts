import { expect, test } from "@playwright/test";
import { textPdf } from "../../src/lib/pdf";
import { register } from "./helpers";

test("inbound fax: webhook delivery, patient suggestion, and filing to outside records", async ({ page }) => {
  await register(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Developers" }).click();
  await page.getByTestId("fax-rotate").click();
  const url = (await page.getByTestId("fax-url").textContent())!;
  const secret = (await page.getByTestId("fax-secret").textContent())!;
  const pdf = Buffer.from(textPdf({ title: "Ophthalmology Consultation", body: "Patient: Maria Gonzalez  DOB: 03/14/1968\nThank you for the referral for a diabetic eye exam.\nNo diabetic retinopathy. Repeat in 12 months." }));
  const bad = await page.request.post(url, { headers: { "x-chartside-fax-secret": "nope" }, multipart: { from: "+13125550111", file: { name: "fax.pdf", mimeType: "application/pdf", buffer: pdf } } });
  expect(bad.status()).toBe(401);
  const ok = await page.request.post(url, { headers: { "x-chartside-fax-secret": secret }, multipart: { from: "+13125550111", num_pages: "1", file: { name: "fax.pdf", mimeType: "application/pdf", buffer: pdf } } });
  expect(ok.status()).toBe(201);
  await page.goto("/inbox");
  const item = page.getByTestId("fax-inbox").getByTestId("fax-item");
  await expect(item).toContainText("From +13125550111");
  await item.getByTestId("fax-file-suggested").filter({ hasText: "Maria Gonzalez" }).click();
  await expect(page.getByTestId("fax-inbox")).toHaveCount(0);
  await page.goto("/patients");
  await page.getByRole("link", { name: /Maria Gonzalez/ }).first().click();
  await expect(page.getByTestId("record").first()).toContainText("Fax from +13125550111");
});
