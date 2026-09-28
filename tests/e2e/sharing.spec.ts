import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, openVisit, register } from "./helpers";

test("share a visit outside the org: emailed link, one-time code, view-only note, revoke", async ({ page, browser }) => {
  await register(page);
  await openVisit(page, "James Carter");
  await consentAndSimulate(page);
  await draftNote(page);
  await page.getByTestId("share-visit").click();
  const email = `cardio${Date.now()}@partner.test`;
  await page.getByTestId("share-email").fill(email);
  await page.getByTestId("share-message").fill("Can you see him this week?");
  await page.getByTestId("share-external-save").click();
  await expect(page.getByTestId("share-ok")).toContainText("Link emailed");
  await expect(page.getByTestId("share-row")).toContainText(email);

  const inbox = async () => (await (await page.request.get(`http://localhost:3295/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
  const link = /http\S+\/x\/\S+/.exec((await inbox())[0].body)![0];

  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(other.getByTestId("xshare-gate")).toContainText("c•••@partner.test");
  await other.getByTestId("xshare-send").click();
  await expect(other.getByTestId("xshare-code")).toBeVisible();
  await expect.poll(async () => (await inbox()).length).toBe(2);
  const code = /\b(\d{6})\b/.exec((await inbox())[1].body)![1];
  await other.getByTestId("xshare-code").fill(code);
  await other.getByTestId("xshare-verify").click();
  await expect(other.getByTestId("shared-note")).toContainText("James Carter");
  await expect(other.getByTestId("shared-note")).toContainText("Can you see him this week?");
  await expect(other.getByTestId("shared-banner")).toContainText("view only");

  await page.reload();
  await page.getByTestId("share-visit").click();
  await expect(page.getByTestId("share-row")).toContainText("viewed 1×");
  await page.getByTestId("share-revoke").click();
  await expect(page.getByTestId("share-row")).toContainText("revoked");
  await other.reload();
  await expect(other.getByTestId("xshare-invalid")).toBeVisible();
});
