import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { register } from "./helpers";

const wav = readFileSync("tests/e2e/fixtures/visit.wav");

test.use({ viewport: { width: 390, height: 844 } });

test("ask answers from the chart offline and turns an edit into a card in the stack", async ({ page }) => {
  await register(page, "Dr. Ask");
  const r = await page.request.post("/api/capture?consent=granted&state=IL&durationS=22", { headers: { "content-type": "audio/wav" }, data: wav });
  const { encounterId, statusUrl } = await r.json();
  await expect.poll(async () => (await (await page.request.get(statusUrl)).json()).status, { timeout: 30_000 }).toBe("ready");
  const before = await (await page.request.get(`/api/capture/${encounterId}/note`)).json();

  await page.goto(`/go/stack?focus=${encounterId}`);
  await page.getByTestId("stack-ask").click();
  await expect(page).toHaveURL(new RegExp(`/go/ask\\?encounter=${encounterId}$`));
  await expect(page.getByTestId("ask-offline")).toBeVisible();
  await expect(page.getByTestId("ask")).toHaveAttribute("data-ready", "true");

  await page.getByTestId("ask-starter").filter({ hasText: "What's waiting on me?" }).click();
  await expect(page.getByTestId("ask-reply").last()).toContainText(/waiting/);

  await page.getByTestId("ask-input").fill("what level are the codes?");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("ask-reply").last()).toContainText(/992\d\d/);

  await page.getByTestId("ask-input").fill("please sign it");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("ask-reply").last()).toContainText("can't sign");

  await page.getByTestId("ask-input").fill("use abbreviations");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("ask-reply").last()).toContainText("stack to approve");
  const card = page.getByTestId("ask-card");
  await expect(card).toHaveCount(1);
  const after = await (await page.request.get(`/api/capture/${encounterId}/note`)).json();
  expect(after.text).toBe(before.text);
  await card.click();
  await expect(page).toHaveURL(/\/go\/stack\?focus=prop%3A/);
  await expect(page.getByTestId("stack-card")).toHaveAttribute("data-kind", "proposal");
  await expect(page.getByTestId("stack-diff")).toBeVisible();
  await page.getByTestId("stack-approve").click();
  await expect(page.getByTestId("stack-toast")).toContainText("Note updated");
  const applied = await (await page.request.get(`/api/capture/${encounterId}/note`)).json();
  expect(applied.text).not.toBe(before.text);
});

test("the agent API refuses anonymous callers and empty conversations", async ({ page, request }) => {
  expect((await request.post("/api/agent", { data: { messages: [{ role: "user", content: "hi" }] } })).status()).toBe(401);
  await register(page);
  expect((await page.request.post("/api/agent", { data: { messages: [] } })).status()).toBe(422);
  const r = await page.request.post("/api/agent", { data: { messages: [{ role: "user", content: "hello" }] } });
  expect(r.status()).toBe(200);
  expect((await r.json()).engine).toBe("local");
});
