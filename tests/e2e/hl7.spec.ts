import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register, signNote } from "./helpers";

test("HL7 interface: configure MLLP, sign a note, and see the accepted MDM^T02 in the log", async ({ page }) => {
  await register(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Developers" }).click();
  const hl7 = page.getByTestId("hl7-settings");
  await hl7.getByTestId("hl7-enabled").check();
  await hl7.getByTestId("hl7-host").fill("bad host!");
  await hl7.getByTestId("hl7-save").click();
  await expect(hl7.getByTestId("hl7-msg")).toContainText("Enter the interface engine host");
  await hl7.getByTestId("hl7-host").fill("127.0.0.1");
  await hl7.getByTestId("hl7-port").fill("3294");
  await hl7.getByTestId("hl7-save").click();
  await expect(hl7.getByTestId("hl7-msg")).toHaveText("Saved.");

  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await draftNote(page);
  await signNote(page);
  const encId = page.url().split("/encounters/")[1].split("?")[0];
  const log = await (await page.request.get(`/api/encounters/${encId}/hl7`)).json();
  expect(log.log[0]).toMatchObject({ status: "accepted", detail: "ACK AA" });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Developers" }).click();
  await expect(page.getByTestId("hl7-log")).toContainText("accepted");
});
