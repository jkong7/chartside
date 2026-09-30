import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { dial } from "./fake-twilio.mjs";
import { register } from "./helpers";

const MOCK_DG = process.env.MOCK_DG_URL ?? "http://localhost:3299";
const MOCK_MAIL = process.env.MOCK_MAIL_URL ?? "http://localhost:3295";
const spoken = async (request: APIRequestContext) => ((await (await request.get(`${MOCK_DG}/stats`)).json()) as { spoken: string[] }).spoken;
const dgStats = async (request: APIRequestContext) => (await (await request.get(`${MOCK_DG}/stats`)).json()) as { grants: number; practiceProxied?: number; spoken: string[] };

const NOTE = `S: 58M with 2 hours of chest pressure radiating to the left arm and jaw. Smoker.
O: Heart tachycardic, regular rhythm, no murmur.
A: Acute coronary syndrome most likely. Also consider aortic dissection and pulmonary embolism.
P: ECG now, troponin, aspirin, cardiology.`;

async function ask(page: Page, text: string) {
  const before = await page.locator("[data-role=patient]").count();
  await page.getByTestId("practice-ask-input").fill(text);
  await page.getByTestId("practice-ask").click();
  await expect(page.locator("[data-role=patient]")).toHaveCount(before + 1);
  return (await page.locator("[data-role=patient]").last().textContent()) ?? "";
}

async function startCase(page: Page, caseId: string, opts: { name?: string; cohort?: string; query?: string } = {}) {
  await page.goto(`/practice/${caseId}${opts.query ?? ""}`);
  if (opts.name) await page.getByTestId("practice-name").fill(opts.name);
  if (opts.cohort) await page.getByTestId("practice-cohort").fill(opts.cohort);
  await page.getByTestId("practice-start").click();
  await expect(page.getByTestId("practice-encounter")).toBeVisible();
}

async function quickScore(request: APIRequestContext, caseId: string, questions: string[], extra: Record<string, unknown> = {}, note = "") {
  const s = (await (await request.post("/api/practice", { data: { caseId, ...extra } })).json()) as { id: string };
  for (const text of questions) expect((await request.post(`/api/practice/${s.id}/turn`, { data: { text } })).ok()).toBe(true);
  const r = (await (await request.post(`/api/practice/${s.id}/note`, { data: { note } })).json()) as { score: number };
  return { id: s.id, score: r.score };
}

test("a student finds practice from the landing page, interviews by typing, examines, writes a note and gets a scorecard", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-practice").click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByTestId("practice-case")).toHaveCount(8);
  await page.getByTestId("practice-case").filter({ hasText: "Chest pain" }).click();
  await expect(page.getByTestId("practice-door")).toContainText("Robert Alvarez, 58");
  await expect(page.getByTestId("practice-door")).toContainText("BP 158/94");
  await page.getByTestId("practice-name").fill("jordan");
  await page.getByTestId("practice-start").click();
  await expect(page.getByTestId("practice-timer")).toHaveText(/^1[12]:\d\d$/);
  await expect(page).toHaveURL(/\/practice\/chest-pain\?s=prs_/);
  expect(await ask(page, "Hi, I'm Jordan, a medical student. What brings you in today?")).toContain("pressure in my chest");
  expect(await ask(page, "Does the pain go anywhere, like your arm or jaw?")).toContain("left arm");
  expect(await ask(page, "That sounds scary. Do you smoke?")).toContain("pack a day");
  const opening = await ask(page, "Do you have any other symptoms?");
  expect(opening).not.toContain("cocaine");
  await page.getByTestId("practice-exam-heart").click();
  await expect(page.getByTestId("practice-finding").last()).toContainText("No murmurs");
  await page.reload();
  await expect(page.getByTestId("practice-turn")).toHaveCount(10);
  await expect(page.getByTestId("practice-timer")).toBeVisible();
  await page.getByTestId("practice-end").click();
  await expect(page.getByTestId("practice-note-step")).toBeVisible();
  await page.getByTestId("practice-note").fill(NOTE);
  await page.getByTestId("practice-grade").click();
  await expect(page).toHaveURL(/\/practice\/s\/prs_/);
  const card = page.getByTestId("scorecard");
  await expect(card).toHaveAttribute("data-owner", "1");
  await expect(page.getByTestId("scorecard-name")).toHaveText("Jordan");
  const overall = Number(await page.getByTestId("score-overall").textContent());
  expect(overall).toBeGreaterThan(20);
  expect(overall).toBeLessThan(90);
  for (const k of ["history", "exam", "communication", "note"]) await expect(page.getByTestId(`cat-${k}`)).toBeVisible();
  await expect(page.getByTestId("fix")).toHaveCount(3);
  await expect(page.getByTestId("fix-time")).toHaveCount(0);
  await expect(page.getByTestId("red-flags")).toContainText("Exertional pattern");
  await expect(page.getByTestId("chartside-note")).toContainText("SUBJECTIVE");
  await expect(page.getByTestId("my-note")).toContainText("Acute coronary syndrome");
  await expect(page.getByTestId("rubric-item").filter({ hasText: "Radiation to arm or jaw" })).toHaveAttribute("data-hit", "1");
  await expect(page.getByTestId("transcript")).toContainText("left arm");
  const stamp = page.getByTestId("rubric-item").filter({ hasText: "Radiation to arm or jaw" }).locator("a");
  await expect(stamp).toHaveText(/^\d+:\d\d$/);
  const href = (await stamp.getAttribute("href"))!;
  expect(href).toMatch(/^#turn-t\d+$/);
  await expect(page.locator(href)).toBeVisible();
});

test("a student interviews by voice with the fake mic and hears the patient, then dictates the note", async ({ page, request }) => {
  await startCase(page, "chest-pain");
  const before = ((await (await request.get(`${MOCK_DG}/stats`)).json()) as { practiceConnections?: number }).practiceConnections ?? 0;
  const proxied = (await dgStats(request)).practiceProxied ?? 0;
  await page.getByTestId("practice-mic").click();
  await expect(page.locator("[data-role=student]").filter({ hasText: "What brings you in today?" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-role=patient]").filter({ hasText: "left arm" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-role=patient]").filter({ hasText: "pack a day" })).toBeVisible({ timeout: 20_000 });
  expect((((await (await request.get(`${MOCK_DG}/stats`)).json()) as { practiceConnections?: number }).practiceConnections ?? 0) - before).toBeGreaterThanOrEqual(1);
  expect(((await dgStats(request)).practiceProxied ?? 0) - proxied).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await spoken(request)).some((s) => s.includes("pack a day")), { timeout: 15_000 }).toBe(true);
  await page.getByTestId("practice-mic").click();
  await page.getByTestId("practice-ask-input").fill("end encounter");
  await page.getByTestId("practice-ask").click();
  await expect(page.getByTestId("practice-note-step")).toBeVisible();
  await page.getByTestId("practice-note").fill("");
  await page.getByTestId("practice-note-dictate").click();
  await expect(page.getByTestId("practice-note")).toHaveValue(/Acute coronary syndrome\. P: ECG, troponin and aspirin\./, { timeout: 20_000 });
  await page.getByTestId("practice-note-dictate").click();
  await page.getByTestId("practice-grade").click();
  await expect(page).toHaveURL(/\/practice\/s\/prs_/);
  await expect(page.getByTestId("my-note")).toContainText("left arm");
  await expect(page.getByTestId("rubric-item").filter({ hasText: "Smoking" })).toHaveAttribute("data-hit", "1");
});

test("the timer ends the encounter and moves to the note", async ({ page }) => {
  await startCase(page, "headache");
  await page.evaluate(() => {
    const real = Date.now;
    const skew = 13 * 60_000;
    Date.now = () => real() + skew;
  });
  await expect(page.getByTestId("practice-note-step")).toBeVisible({ timeout: 10_000 });
});

test("the shared scorecard is public-safe, has an OG image, and the challenge link starts the same case", async ({ page, browser, request }) => {
  const mine = await quickScore(page.request, "abdominal-pain", ["What brings you in?", "When was your last period?"], { name: "Priya" }, "RLQ pain. A: appendicitis. P: pregnancy test, CBC, ultrasound, surgery consult.");
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/practice/s/${mine.id}`);
  await expect(stranger.getByTestId("scorecard")).toHaveAttribute("data-owner", "0");
  await expect(stranger.getByTestId("score-overall")).toHaveText(String(mine.score));
  await expect(stranger.getByTestId("no-phi")).toContainText("fictional patient");
  await expect(stranger.getByTestId("transcript")).toHaveCount(0);
  await expect(stranger.getByTestId("my-note")).toHaveCount(0);
  await expect(stranger.getByTestId("fix")).toHaveCount(3);
  await expect(stranger.locator("body")).not.toContainText("When was your last period?");
  const og = await stranger.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(/\/practice\/s\/prs_[a-z0-9]+\/opengraph-image/);
  await expect(stranger.locator('meta[property="og:title"]')).toHaveAttribute("content", `Priya scored ${mine.score} on the abdominal pain case`);
  const img = await request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect((await img.body()).length).toBeGreaterThan(5000);
  const direct = await request.get(`/api/practice/${mine.id}`);
  expect(JSON.stringify(await direct.json())).not.toContain("last period");
  await stranger.getByTestId("accept-challenge").click();
  await expect(stranger.getByTestId("practice-challenge")).toContainText(`Priya scored ${mine.score}`);
  await stranger.getByTestId("practice-name").fill("Ben");
  await stranger.getByTestId("practice-start").click();
  await ask(stranger, "What brings you in today?");
  await stranger.getByTestId("practice-end").click();
  await stranger.getByTestId("practice-skip").click();
  await expect(stranger.getByTestId("rival")).toContainText(`Priya scored ${mine.score}.`);
  await page.goto(`/practice/s/${mine.id}`);
  await page.getByTestId("challenge-copy").click();
  await expect(page.getByTestId("share-done")).toContainText("Challenge link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/practice/abdominal-pain?challenge=${mine.id}`);
});

test("a class code shows a first-name leaderboard with each person's best score", async ({ browser }) => {
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const low = await quickScore(a.request, "chest-pain", ["What brings you in?"], { name: "Ava Smith", cohort: code });
  const high = await quickScore(a.request, "chest-pain", ["What brings you in?", "Does it go anywhere?", "Do you smoke?", "Any heart disease in your family?"], { name: "Ava", cohort: code });
  const mid = await quickScore(b.request, "chest-pain", ["What brings you in?", "When did it start?"], { name: "Ben", cohort: code });
  expect(high.score).toBeGreaterThan(Math.max(low.score, mid.score));
  await a.goto("/practice");
  await a.locator("#class-code").fill(code.toLowerCase());
  await a.getByRole("button", { name: "See leaderboard" }).click();
  await expect(a).toHaveURL(new RegExp(`/practice/c/${code}$`));
  const rows = a.getByTestId("board-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Ava");
  await expect(rows.nth(0)).toContainText(String(high.score));
  await expect(rows.nth(1)).toContainText("Ben");
  await expect(a.locator("body")).not.toContainText("Smith");
  await a.goto(`/practice/s/${high.id}`);
  await expect(a.getByTestId("cohort-link")).toHaveAttribute("href", `/practice/c/${code}`);
});

test("present to the attending by voice, then answer the attending's questions", async ({ page }) => {
  const s = await quickScore(page.request, "chest-pain", ["What brings you in?", "Does it go anywhere?"]);
  await page.goto(`/practice/s/${s.id}`);
  await page.getByTestId("attending-open").click();
  await page.getByTestId("attending-mic").click();
  await expect(page.getByTestId("attending-text")).toHaveValue(/I would get an ECG, troponin, and give aspirin\./, { timeout: 20_000 });
  await page.getByTestId("attending-mic").click();
  await page.getByTestId("attending-submit").click();
  const score = Number((await page.getByTestId("attending-score").textContent())!.replace("/10", ""));
  expect(score).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("attending-items")).toContainText("Commits to a leading diagnosis");
  await page.getByTestId("pimp-0").fill("A 12 lead EKG within ten minutes");
  await page.getByTestId("pimp-1").fill("Morphine");
  await page.getByTestId("pimp-submit").click();
  await expect(page.getByTestId("pimp-verdict")).toHaveText([/^Correct\./, /^Not quite\./, /^No answer\./]);
  await page.reload();
  await expect(page.getByTestId("attending-score")).toBeVisible();
  await expect(page.getByTestId("history-count")).toContainText("presentation");
});

test("saving progress with an email code claims the scores and gives .edu emails a student badge", async ({ page, request }) => {
  const s = await quickScore(page.request, "low-back-pain", ["What brings you in?"]);
  await page.goto(`/practice/s/${s.id}`);
  await expect(page.getByTestId("student-badge")).toHaveCount(0);
  const email = `m3-${Date.now()}@med.example.edu`;
  await page.getByTestId("save-email").fill(email);
  await page.getByTestId("save-send").click();
  await expect(page.getByTestId("save-code")).toBeVisible();
  let code = "";
  await expect.poll(async () => {
    const mail = (await (await request.get(`${MOCK_MAIL}/messages?to=${encodeURIComponent(email)}`)).json()) as { body: string }[];
    code = /\b(\d{6})\b/.exec(mail.at(-1)?.body ?? "")?.[1] ?? "";
    return code;
  }).toMatch(/^\d{6}$/);
  await page.getByTestId("save-code").fill(code);
  await page.getByTestId("save-verify").click();
  await expect(page.getByTestId("student-badge")).toBeVisible();
  await expect(page.getByTestId("saved-as")).toContainText(email);
  await expect(page.getByTestId("save-progress")).toHaveCount(0);
  await page.goto("/practice");
  await expect(page.getByTestId("practice-recent")).toContainText("Low back pain");
});

test("guests can't play someone else's session and bad input is refused", async ({ page, browser }) => {
  const s = await quickScore(page.request, "chest-pain", ["What brings you in?"]);
  const other = await browser.newContext();
  const r = await other.request.post(`/api/practice/${s.id}/turn`, { data: { text: "Hi" } });
  expect(r.status()).toBe(403);
  expect((await page.request.post("/api/practice", { data: { caseId: "nope" } })).status()).toBe(422);
  expect((await page.request.post("/api/practice", { data: { caseId: "chest-pain", cohort: "!!" } })).status()).toBe(422);
  expect((await other.request.get(`/api/practice/${s.id}/speak?turn=t2`)).status()).toBe(404);
  const speak = await page.request.get(`/api/practice/${s.id}/speak?turn=t2`);
  expect(speak.status()).toBe(200);
  expect(speak.headers()["content-type"]).toBe("audio/basic");
});

test("speech never hands out a Deepgram token and stops when the encounter ends", async ({ page, request }) => {
  const s = (await (await page.request.post("/api/practice", { data: { caseId: "chest-pain" } })).json()) as { id: string };
  const grants = (await dgStats(request)).grants;
  const early = await page.request.post("/api/practice/speech", { data: { session: s.id, purpose: "note" } });
  expect(early.status()).toBe(422);
  const providers: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = (await (await page.request.post("/api/practice/speech", { data: { session: s.id, purpose: "encounter" } })).json()) as { provider: string; url: string | null; token: string | null };
    providers.push(r.provider);
    if (r.provider === "deepgram") expect(r.url).toBe("/api/voice/practice");
  }
  expect(providers).toEqual(["deepgram", "deepgram", "deepgram", "browser"]);
  expect((await dgStats(request)).grants).toBe(grants);
  await page.request.post(`/api/practice/${s.id}/end`, { data: {} });
  expect((await page.request.post("/api/practice/speech", { data: { session: s.id, purpose: "encounter" } })).status()).toBe(422);
});

test("each patient reply is voiced once, however often it is replayed", async ({ page, request }) => {
  const s = (await (await page.request.post("/api/practice", { data: { caseId: "chest-pain" } })).json()) as { id: string };
  const turn = (await (await page.request.post(`/api/practice/${s.id}/turn`, { data: { text: "Do you smoke?" } })).json()) as { added: { id: string; role: string; text: string }[] };
  const reply = turn.added.find((t) => t.role === "patient")!;
  const count = async () => (await spoken(request)).filter((x) => x === reply.text).length;
  const n = await count();
  for (let i = 0; i < 3; i++) expect((await page.request.get(`/api/practice/${s.id}/speak?turn=${reply.id}`)).status()).toBe(200);
  expect((await count()) - n).toBe(1);
});

test("a graded note can't be resubmitted and the case opens on its scorecard", async ({ page }) => {
  const s = (await (await page.request.post("/api/practice", { data: { caseId: "chest-pain" } })).json()) as { id: string };
  expect((await page.request.post(`/api/practice/${s.id}/note`, { data: { note: "A: ACS." } })).ok()).toBe(true);
  const again = await page.request.post(`/api/practice/${s.id}/note`, { data: { note: "Pasted reference note" } });
  expect(again.status()).toBe(422);
  expect(((await again.json()) as { error: string }).error).toMatch(/already graded/);
  await page.goto(`/practice/chest-pain?s=${s.id}`);
  await expect(page).toHaveURL(new RegExp(`/practice/s/${s.id}$`));
  await expect(page.getByTestId("practice-note-step")).toHaveCount(0);
});

test("on a shared computer, saving is an explicit button and signing out locks the scorecard", async ({ page, baseURL }) => {
  const s = await quickScore(page.request, "headache", ["What brings you in today?"]);
  await register(page, "Alice Shared");
  await page.goto(`/practice/s/${s.id}`);
  await expect(page.getByTestId("scorecard")).toHaveAttribute("data-owner", "1");
  await expect(page.getByTestId("save-to-account")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("save-to-account")).toBeVisible();
  await expect(page.getByTestId("saved-as")).toHaveCount(0);
  const cookie = async () => (await page.context().cookies()).find((c) => c.name === "cs_prac")?.value ?? null;
  const before = await cookie();
  expect(before).toBeTruthy();
  await page.getByTestId("save-to-account-button").click();
  await expect(page.getByTestId("saved-as")).toBeVisible();
  const rotated = await cookie();
  expect(rotated).toBeTruthy();
  expect(rotated).not.toBe(before);
  expect((await page.request.post("/api/auth/logout")).ok()).toBe(true);
  expect(await cookie()).toBeNull();
  await page.goto(`/practice/s/${s.id}`);
  await expect(page.getByTestId("scorecard")).toHaveAttribute("data-owner", "0");
  await expect(page.getByTestId("transcript")).toHaveCount(0);
  await page.context().addCookies([{ name: "cs_prac", value: before!, url: baseURL! }]);
  await page.reload();
  await expect(page.getByTestId("scorecard")).toHaveAttribute("data-owner", "0");
  expect((await page.request.get(`/api/practice/${s.id}`)).ok()).toBe(true);
  expect(JSON.stringify(await (await page.request.get(`/api/practice/${s.id}`)).json())).not.toContain("What brings you in today?");
});

test("a student calls the line, presses 7, takes a history by voice, and gets a PHI-free scorecard text", async ({ page, request, baseURL }) => {
  const call = await dial({
    base: baseURL!,
    sim: true,
    mockDeepgram: MOCK_DG,
    frameMs: 1,
    steps: [
      { waitPrompts: 1 },
      { digit: "7" },
      { waitState: "practice" },
      { waitPrompts: 2 },
      { digit: "1" },
      { waitPrompts: 3 },
      { say: "Hi, I'm Sam, a medical student. What brings you in today?" },
      { waitPrompts: 4 },
      { say: "Does the pain go anywhere, like your arm or jaw?" },
      { waitPrompts: 5 },
      { say: "I'd like to listen to your heart." },
      { waitPrompts: 6 },
      { digit: "5" },
      { waitClose: true, timeoutMs: 30_000 },
    ],
  });
  expect(call.connected).toBe(true);
  const said = await spoken(request);
  expect(said.some((s) => s.includes("Press 7 to practice a case"))).toBe(true);
  expect(said.some((s) => s.startsWith("Practice mode. Every patient is fictional."))).toBe(true);
  expect(said.some((s) => s.includes("Go ahead and introduce yourself"))).toBe(true);
  expect(said.some((s) => s.includes("pressure in my chest"))).toBe(true);
  expect(said.some((s) => s.includes("left arm"))).toBe(true);
  expect(said.some((s) => s.includes("Exam finding: Tachycardic"))).toBe(true);
  expect(said.some((s) => /^Encounter over\. You covered \d+ of 16 history items\./.test(s))).toBe(true);
  let texts: { body: string }[] = [];
  await expect.poll(async () => {
    texts = ((await (await request.get(`/api/voice/sim/messages?key=${encodeURIComponent(call.inboxKey!)}`)).json()) as { messages: { body: string }[] }).messages;
    return texts.length;
  }).toBeGreaterThan(0);
  const body = texts.at(-1)!.body;
  expect(body).toMatch(/^Chartside Practice: your practice case is scored\. Write your note and see your scorecard: http:\/\/localhost:\d+\/api\/practice\/open\?s=prs_/);
  expect(body).not.toMatch(/chest|pain|Alvarez/i);
  await page.goto(/(http:\/\/\S+)/.exec(body)![1]);
  await expect(page).toHaveURL(/\/practice\/s\/prs_/);
  await expect(page.getByTestId("scorecard")).toHaveAttribute("data-owner", "1");
  await expect(page.getByTestId("scorecard")).toContainText("by phone");
  await expect(page.getByTestId("rubric-item").filter({ hasText: "Radiation to arm or jaw" })).toHaveAttribute("data-hit", "1");
  await page.getByTestId("write-note-cta").getByRole("link").click();
  await expect(page.getByTestId("practice-note-step")).toBeVisible();
  await page.getByTestId("practice-note").fill(NOTE);
  await page.getByTestId("practice-grade").click();
  await expect(page.getByTestId("chartside-note")).toBeVisible();
});

test("practice pages have no serious or critical WCAG 2.1 AA violations", async ({ page }) => {
  const scan = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  };
  const problems: string[] = [];
  await page.goto("/practice");
  problems.push(...(await scan("landing")));
  await startCase(page, "pediatric-fever", { cohort: "A11Y-CLASS", name: "Ana" });
  await ask(page, "Hi, I'm Dr. Lee. What brings Mateo in today?");
  await page.getByTestId("practice-exam-ears").click();
  await expect(page.getByTestId("practice-finding")).toHaveCount(1);
  problems.push(...(await scan("encounter")));
  await page.getByTestId("practice-end").click();
  await expect(page.getByTestId("practice-note-step")).toBeVisible();
  problems.push(...(await scan("note")));
  await page.getByTestId("practice-note").fill("Fever and ear pulling. A: otitis media. P: amoxicillin.");
  await page.getByTestId("practice-grade").click();
  await expect(page.getByTestId("scorecard")).toBeVisible();
  problems.push(...(await scan("scorecard")));
  await page.getByTestId("attending-open").click();
  problems.push(...(await scan("attending")));
  await page.goto("/practice/c/A11Y-CLASS");
  problems.push(...(await scan("leaderboard")));
  expect(problems).toEqual([]);
});
