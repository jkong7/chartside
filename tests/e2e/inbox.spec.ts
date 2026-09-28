import { expect, test } from "@playwright/test";
import { consentAndSimulate, draftNote, register } from "./helpers";

test("inbox triages seeded patient messages, drafts replies from the chart, and turns them into tasks", async ({ page }) => {
  await register(page);
  await expect(page.getByTestId("inbox-count")).toBeVisible();
  await page.getByTestId("nav").getByRole("link", { name: /Inbox/ }).click();
  await page.waitForURL("**/inbox");
  const rows = page.getByTestId("message-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Elena Russo");
  await expect(rows.first().getByTestId("urgency")).toHaveText("Emergency");
  await expect(rows.nth(1).getByTestId("urgency")).toHaveText("Same day");

  await rows.first().click();
  await expect(page.getByTestId("triage-banner")).toContainText("Possible emergency: chest pain");
  await expect(page.getByTestId("reply-text")).toHaveValue(/call 911 or go to the nearest emergency room/);
  await expect(page.getByTestId("send-reply")).toBeDisabled();
  await expect(page.getByTestId("placeholder-warning")).toBeVisible();

  await rows.filter({ hasText: "Linda Park" }).click();
  await expect(page.getByTestId("message-context")).toContainText("lisinopril 10 mg daily");
  await expect(page.getByTestId("reply-text")).toHaveValue(/I sent a refill of lisinopril 10 mg daily to your pharmacy\./);
  await page.getByTestId("send-reply").click();
  await expect(page.getByText("Reply sent to Linda Park.")).toBeVisible();
  await expect(rows).toHaveCount(4);

  await rows.filter({ hasText: "Lucia Torres" }).click();
  await expect(page.getByTestId("reply-text")).toHaveValue(/^Hola Lucia:/);
  await page.getByTestId("draft-en").click();
  await expect(page.getByTestId("reply-text")).toHaveValue(/^Hi Lucia,/);

  await page.getByTestId("section-tasks").click();
  const tasks = page.getByTestId("task-row");
  await expect(tasks.filter({ hasText: "Send refill: lisinopril 10 mg daily" })).toBeVisible();
  await expect(tasks.filter({ hasText: "Call now: Elena Russo" })).toBeVisible();
  const before = await tasks.count();
  await tasks.filter({ hasText: "Send refill: lisinopril" }).getByTestId("task-done").click();
  await expect(tasks).toHaveCount(before - 1);
});

test("a patient messages the care team from the visit link and sees the clinician's reply", async ({ page, browser }) => {
  await register(page);
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await consentAndSimulate(page);
  await draftNote(page);

  await page.getByRole("tab", { name: /Tasks/ }).click();
  await expect(page.getByTestId("visit-task").first()).toBeVisible();
  await page.getByTestId("task-title").fill("Call with A1c trend");
  await page.getByTestId("task-add").click();
  await expect(page.getByTestId("visit-task").filter({ hasText: "Call with A1c trend" })).toBeVisible();

  await page.getByRole("tab", { name: /Patient summary/ }).click();
  await page.getByTestId("share").click();
  const href = (await page.getByTestId("share-link").getAttribute("href"))!;

  const ctx = await browser.newContext();
  const patient = await ctx.newPage();
  await patient.goto(href);
  await patient.getByTestId("patient-message").fill("Should I take the metformin with food? It still upsets my stomach.");
  await patient.getByTestId("patient-send").click();
  await expect(patient.getByTestId("patient-thread-item")).toHaveCount(1);
  await expect(patient.getByText("Your care team usually replies within 2 business days.")).toBeVisible();

  await page.goto("/inbox");
  const row = page.getByTestId("message-row").filter({ hasText: "metformin with food" });
  await row.click();
  await expect(page.getByTestId("message-body")).toContainText("metformin with food");
  const reply = page.getByTestId("reply-text");
  await expect(reply).toHaveValue(/\*\*\*/);
  const draft = await reply.inputValue();
  await reply.fill(draft.replace("***", "Yes, take it with breakfast and dinner. We can switch to the extended-release form if it still bothers you."));
  await page.getByTestId("send-reply").click();
  await expect(page.getByText("Reply sent to Maria Gonzalez.")).toBeVisible();

  await patient.reload();
  await expect(patient.getByTestId("patient-reply")).toContainText("extended-release");
  await ctx.close();
});
