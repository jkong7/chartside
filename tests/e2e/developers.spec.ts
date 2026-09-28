import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test("admin creates an API key and webhook; the key drives the public API and deliveries are logged", async ({ page }) => {
  await register(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Developers" }).click();
  await page.getByTestId("key-name").fill("Telehealth platform");
  await page.getByTestId("create-key").click();
  const token = (await page.getByTestId("secret-value").textContent())!;
  expect(token).toMatch(/^cs_live_/);
  await expect(page.getByTestId("api-key")).toContainText("Telehealth platform");

  const unauth = await page.request.get("/api/v1/patients");
  expect(unauth.status()).toBe(401);
  const res = await page.request.get("/api/v1/patients?mrn=100482", { headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  expect((await res.json()).data[0].name).toBe("Maria Gonzalez");
  const spec = await (await page.request.get("/api/v1/openapi.json")).json();
  expect(spec.info.title).toBe("Chartside API");

  await page.getByTestId("webhook-url").fill("http://localhost:3297/chartside-hook");
  await page.getByTestId("create-webhook").click();
  await expect(page.getByTestId("secret-value")).toContainText("whsec_");
  await page.getByTestId("ping-webhook").click();
  await expect(page.getByTestId("delivery").first()).toContainText("ping");
  await expect(page.getByTestId("delivery").first()).toContainText(/retrying|failed|delivered/);

  await page.getByTestId("revoke-key").click();
  await expect(page.getByTestId("api-key")).toContainText("Revoked");
  expect((await page.request.get("/api/v1/patients", { headers: { authorization: `Bearer ${token}` } })).status()).toBe(401);
});
