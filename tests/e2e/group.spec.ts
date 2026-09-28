import { expect, test } from "@playwright/test";
import { consentAndSimulate, register } from "./helpers";

test("group therapy: one recording, speaker attribution, separate member notes billed 90853", async ({ page }) => {
  await register(page);
  await page.getByTestId("nav").getByRole("link", { name: "Groups" }).click();
  await page.waitForURL("**/groups");
  await page.getByTestId("group-new").click();
  await page.getByTestId("group-title").fill("Coping skills group");
  await page.getByTestId("group-member-jordan").click();
  await page.getByTestId("group-member-daniel").click();
  await page.getByTestId("group-member-priya").click();
  await page.getByTestId("group-create").click();
  await page.waitForURL("**/encounters/**");
  await expect(page.getByTestId("patient-name")).toHaveText("Coping skills group");
  await consentAndSimulate(page);

  await page.getByTestId("group-chip").click();
  await page.waitForURL("**/groups/grp_*");
  const members = page.getByTestId("group-member");
  await expect(members.filter({ hasText: "Jordan Reyes" }).getByTestId("group-member-lines")).toHaveText("3 lines attributed");
  await expect(members.filter({ hasText: "Daniel Kim" }).getByTestId("group-member-lines")).toHaveText("2 lines attributed");
  const line = page.getByTestId("group-line").filter({ hasText: "gym three times" });
  await expect(line.getByTestId("group-assign")).toHaveValue(/pat_/);
  await page.getByTestId("group-make-notes").click();
  await expect(members.getByTestId("group-member-note")).toHaveCount(3);

  await members.filter({ hasText: "Daniel Kim" }).getByTestId("group-member-note").click();
  await page.waitForURL("**/encounters/**");
  await expect(page.getByTestId("patient-name")).toHaveText("Daniel Kim");
  await expect(page.getByTestId("group-chip")).toHaveText("Group: Coping skills group");
  await expect(page.getByTestId("section-topic")).toContainText("Topic: managing stress with coping skills.");
  const editor = page.getByTestId("note-editor");
  await expect(editor).toContainText("gym");
  await expect(editor).not.toContainText("Jordan");
  await expect(editor).not.toContainText("Priya");
  await expect(editor).not.toContainText("breathing exercise");
  await expect(page.getByRole("tab", { name: /Codes/ })).toContainText("90853");
});
