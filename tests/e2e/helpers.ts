import { expect, type Page } from "@playwright/test";

export async function register(page: Page, name = "Dr. Avery Chen", opts: { email?: string; fullNav?: boolean } = {}) {
  const email = opts.email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@chartside.test`;
  await page.goto("/login");
  const res = await page.request.post("/api/auth/register", { data: { name, email, password: "correct-horse-9", demo: true } });
  expect(res.status(), await res.text()).toBe(201);
  if (opts.fullNav !== false) expect((await page.request.patch("/api/auth/me", { data: { prefs: { simpleNav: false } } })).ok()).toBe(true);
  await page.goto("/today");
  return email;
}

export async function mailCode(page: Page, to: string) {
  let code: string | null = null;
  await expect.poll(async () => {
    const mail = (await (await page.request.get(`http://localhost:3295/messages?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
    code = mail.length ? (/\b(\d{6})\b/.exec(mail.at(-1)!.body)?.[1] ?? null) : null;
    return code;
  }).toBeTruthy();
  return code!;
}

export async function textCode(page: Page, to: string) {
  let code: string | null = null;
  await expect.poll(async () => {
    const sms = (await (await page.request.get(`http://localhost:3295/texts?to=${encodeURIComponent(to)}`)).json()) as { body: string }[];
    code = sms.length ? (/\b(\d{6})\b/.exec(sms.at(-1)!.body)?.[1] ?? null) : null;
    return code;
  }).toBeTruthy();
  return code!;
}

export async function openVisit(page: Page, patient: string) {
  await page.goto("/today");
  await page.getByTestId("visit-row").filter({ hasText: patient }).click();
  await expect(page.getByTestId("consent-card")).toBeVisible();
}

export async function consentAndSimulate(page: Page) {
  await page.getByRole("button", { name: "Patient agreed" }).click();
  await expect(page.getByText("Consent recorded")).toBeVisible();
  await page.getByTestId("start-simulate").click();
  await page.getByLabel("Playback speed").selectOption("10");
  await expect(page.getByTestId("sim-done")).toBeVisible({ timeout: 60_000 });
}

export async function draftNote(page: Page) {
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("note-editor")).toBeVisible({ timeout: 60_000 });
}

export async function signNote(page: Page) {
  await page.getByTestId("sign").click();
  const anyway = page.getByTestId("sign-anyway");
  await expect(anyway.or(page.locator("[data-status=signed]").first())).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(page.locator("[data-status=signed]").first()).toBeVisible();
}
