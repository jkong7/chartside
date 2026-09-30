import { afterEach, describe, expect, it, vi } from "vitest";
import { emailReady } from "@/lib/server/delivery";

describe("emailReady", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false in production with no email provider, so sign-up falls back to a password", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHARTSIDE_DELIVERY", "");
    vi.stubEnv("SENDGRID_API_KEY", "");
    expect(emailReady()).toBe(false);
  });

  it("is true with SendGrid set, or with file delivery", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENDGRID_API_KEY", "key");
    vi.stubEnv("CHARTSIDE_EMAIL_FROM", "notes@chartside.test");
    expect(emailReady()).toBe(true);
    vi.stubEnv("SENDGRID_API_KEY", "");
    vi.stubEnv("CHARTSIDE_DELIVERY", "file");
    expect(emailReady()).toBe(true);
  });
});
