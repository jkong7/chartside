import { expect, test, type Browser, type Page } from "@playwright/test";
import { consentAndSimulate, draftNote, register } from "./helpers";

const IDP = "http://localhost:3296";
const uniq = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

async function invite(page: Page, email: string, role: string) {
  await page.goto("/admin");
  await page.fill("#invite-email", email);
  await page.selectOption("#invite-role", role);
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!;
  await expect(page.getByTestId("pending-invites")).toContainText(email);
  return link;
}

async function fresh(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

test.describe.configure({ mode: "serial" });

test("owner invites a scribe who drafts a note the clinician signs; roles change what members can do", async ({ page, browser }) => {
  await register(page, "Dr. Olivia Park");
  const nav = page.getByTestId("nav");
  await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
  await expect(page.getByTestId("org-name")).toContainText("Owner");

  const scribeEmail = `scribe-${uniq()}@chartside.test`;
  const link = await invite(page, scribeEmail, "scribe");
  expect(link).toMatch(/\/invite\/[a-f0-9]{64}$/);

  const s = await fresh(browser);
  await s.page.goto(link);
  await expect(s.page.getByTestId("invite-banner")).toContainText("as Scribe");
  await expect(s.page.locator("#email")).toHaveValue(scribeEmail);
  await s.page.fill("#name", "Sam Rivera");
  await s.page.fill("#password", "correct-horse-9");
  await s.page.click("button[type=submit]");
  await s.page.waitForURL("**/today");
  const sNav = s.page.getByTestId("nav");
  await expect(sNav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(sNav.getByRole("link", { name: "Insights" })).toHaveCount(0);
  await expect(sNav.getByRole("link", { name: "Templates" })).toBeVisible();
  await expect(s.page.getByRole("button", { name: "Reset demo day" })).toHaveCount(0);
  await expect(s.page.getByTestId("row-clinician").first()).toHaveText(" · Dr. Olivia Park");

  await s.page.getByTestId("visit-row").filter({ hasText: "Maria Gonzalez" }).click();
  await expect(s.page.getByTestId("visit-clinician")).toHaveText(" · Dr. Olivia Park");
  await consentAndSimulate(s.page);
  await draftNote(s.page);
  await expect(s.page.getByTestId("sign")).toHaveCount(0);
  await expect(s.page.getByTestId("awaiting-signature")).toHaveText("Awaiting Dr. Olivia Park's signature");
  const encUrl = s.page.url();
  const encId = encUrl.split("/encounters/")[1].split("?")[0];
  const forced = await s.page.request.post(`/api/encounters/${encId}/sign`, { data: { force: true } });
  expect(forced.status()).toBe(403);
  expect((await forced.json()).error).toBe("Scribes can prepare notes but only the treating clinician can sign.");

  await page.goto(`/encounters/${encId}`);
  await page.getByTestId("sign").click();
  await page.getByTestId("sign-anyway").click();
  await expect(page.getByText("Note signed.").or(page.getByText(/^Signed\./))).toBeVisible();
  await page.goto(`/encounters/${encId}?tab=audit`);
  await expect(page.getByText("Sam Rivera").first()).toBeVisible();

  await page.goto("/admin");
  const row = page.getByTestId("member-row").filter({ hasText: "Sam Rivera" });
  await row.getByLabel("Role for Sam Rivera").selectOption("coder");
  await expect(page.getByText("Sam Rivera is now Coder / biller.")).toBeVisible();
  await expect(page.getByLabel("Role for Dr. Olivia Park")).toBeDisabled();

  await s.page.goto("/today");
  await expect(sNav.getByRole("link", { name: "Revenue" })).toBeVisible();
  await expect(sNav.getByRole("link", { name: "Templates" })).toHaveCount(0);
  await s.page.goto(`/encounters/${encId}?tab=billing`);
  await expect(s.page.getByTestId("claim-approve").or(s.page.getByTestId("claim-submit"))).toBeVisible();
  await s.page.goto(`/encounters/${encId}`);
  await expect(s.page.getByTestId("edit-section")).toHaveCount(0);
  const edit = await s.page.request.put(`/api/encounters/${encId}/note`, { data: { note: { sections: [] } } });
  expect(edit.status()).toBe(403);
  expect(s.page.url()).toContain(encId);
  await s.page.goto("/admin");
  await expect(s.page).toHaveURL(/\/today$/);
  expect((await s.page.request.get("/api/admin")).status()).toBe(403);

  await row.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText("Sam Rivera can no longer sign in.")).toBeVisible();
  await s.page.goto("/today");
  await expect(s.page).toHaveURL(/\/login$/);
  await s.ctx.close();

  await page.getByTestId("admin-org-name").isVisible();
  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.getByTestId("org-audit")).toContainText("Changed a role");
  await expect(page.getByTestId("org-audit")).toContainText("Sam Rivera: Scribe → Coder / biller");
  await page.getByRole("tab", { name: "Clinician analytics" }).click();
  await expect(page.getByTestId("org-analytics")).toContainText("Dr. Olivia Park");
});

test("an existing user accepts an invitation and switches between organizations", async ({ page, browser }) => {
  await register(page, "Dr. Grace Hall");
  const other = await fresh(browser);
  const otherEmail = await register(other.page, "Dr. Ken Ito");
  const link = await invite(page, otherEmail, "clinician");
  await other.page.goto(link);
  await other.page.getByTestId("accept-invite").click();
  await other.page.waitForURL("**/today");
  const sw = other.page.getByTestId("org-switch");
  await expect(sw).toBeVisible();
  await expect(sw.locator("option:checked")).toContainText("Dr. Grace Hall's clinic · Clinician");
  await expect(other.page.getByTestId("visit-row")).toHaveCount(0);
  await sw.selectOption({ label: "Dr. Ken Ito's clinic · Owner" });
  await expect(other.page.getByTestId("visit-row")).toHaveCount(7);
  await expect(other.page.getByTestId("nav").getByRole("link", { name: "Admin" })).toBeVisible();
  await other.page.goto(link);
  await expect(other.page.getByTestId("invite-invalid")).toBeVisible();
  await other.ctx.close();
});

test("SSO: an admin connects an OIDC provider, new users are provisioned on first sign-in, and passwords are blocked", async ({ page, browser, request }) => {
  const domain = `mercy${uniq()}.test`;
  await register(page, "Dr. Hana Mori");
  await page.goto("/admin?tab=sso");
  await expect(page.getByTestId("sso-redirect")).toHaveText("http://localhost:3200/sso/callback");
  await page.getByTestId("sso-enabled").check();
  await page.fill("#sso-issuer", "http://localhost:1");
  await page.fill("#sso-client", "chartside-sso");
  await page.fill("#sso-domains", domain);
  await page.getByTestId("sso-save").click();
  await expect(page.locator("p[role=alert]")).toContainText("Could not reach http://localhost:1");
  await page.fill("#sso-issuer", IDP);
  await page.fill("#sso-secret", "idp-secret");
  await page.selectOption("#sso-role", "clinician");
  await page.getByTestId("sso-require").check();
  await page.getByTestId("sso-save").click();
  await expect(page.getByText("SSO settings saved.")).toBeVisible();
  await expect(page.locator("#sso-secret")).toHaveAttribute("placeholder", /Stored encrypted/);

  const blocked = await request.post("/api/auth/register", { data: { email: `x@${domain}`, name: "X", password: "correct-horse-9" } });
  expect(blocked.status()).toBe(403);

  const u = await fresh(browser);
  await u.page.goto("/login");
  await u.page.fill("#email", `riley.chen@${domain}`);
  await u.page.locator("#email").blur();
  await expect(u.page.getByTestId("sso-required")).toContainText("Dr. Hana Mori's clinic signs in with single sign-on.");
  await expect(u.page.locator("#password")).toHaveCount(0);
  await u.page.getByRole("button", { name: "Continue with Dr. Hana Mori's clinic" }).click();
  await u.page.waitForURL("**/today");
  await expect(u.page.getByTestId("org-name")).toContainText("Clinician");
  await expect(u.page.getByText("Dr. Riley Chen")).toBeVisible();
  await u.ctx.close();

  await page.goto("/admin");
  await expect(page.getByTestId("member-row").filter({ hasText: "Dr. Riley Chen" })).toContainText(`riley.chen@${domain} · SSO`);

  await fetch(`${IDP}/mode`, { method: "POST", body: JSON.stringify({ mode: "bad-signature" }) });
  const bad = await fresh(browser);
  await bad.page.goto("/login");
  await bad.page.fill("#email", `riley.chen@${domain}`);
  await bad.page.locator("#email").blur();
  await bad.page.getByRole("button", { name: /Continue with/ }).click();
  await expect(bad.page).toHaveURL(/\/login\?error=/);
  await expect(bad.page.locator("p[role=alert]")).toHaveText("ID token signature is invalid");
  await fetch(`${IDP}/mode`, { method: "POST", body: JSON.stringify({ mode: "deny" }) });
  await bad.page.fill("#email", `riley.chen@${domain}`);
  await bad.page.locator("#email").blur();
  await bad.page.getByRole("button", { name: /Continue with/ }).click();
  await expect(bad.page.locator("p[role=alert]")).toHaveText("The user is not assigned to this application.");
  await fetch(`${IDP}/mode`, { method: "POST", body: JSON.stringify({ mode: "normal" }) });
  await bad.ctx.close();

  await page.goto("/admin?tab=audit");
  await expect(page.getByTestId("org-audit")).toContainText("SSO sign-in rejected");
  await expect(page.getByTestId("org-audit")).toContainText("Provisioned via SSO");
});
