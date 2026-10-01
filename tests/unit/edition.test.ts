import { afterEach, describe, expect, it } from "vitest";
import { edition, hiddenInCore } from "@/lib/edition";

describe("edition", () => {
  const prev = process.env.CHARTSIDE_EDITION;
  afterEach(() => {
    process.env.CHARTSIDE_EDITION = prev;
  });

  it("defaults to core and opts into full", () => {
    delete process.env.CHARTSIDE_EDITION;
    expect(edition()).toBe("core");
    process.env.CHARTSIDE_EDITION = "full";
    expect(edition()).toBe("full");
    process.env.CHARTSIDE_EDITION = "anything";
    expect(edition()).toBe("core");
  });

  it("keeps the hook workflow reachable", () => {
    for (const p of ["/", "/line", "/line/card", "/go", "/go/phone", "/go/stack", "/go/upload", "/go/shortcut", "/go/pin", "/go/settings", "/m/abc", "/today", "/encounters/e1", "/patients", "/settings", "/admin", "/login", "/register", "/api/voice/incoming", "/api/voice/stream", "/api/sms/incoming", "/api/capture", "/api/decisions", "/api/encounters/e1", "/api/encounters/e1/note", "/api/encounters/e1/sign", "/api/encounters/e1/finish", "/api/encounters/e1/consent", "/api/encounters/e1/coverage", "/api/encounters/e1/export", "/api/auth/me", "/api/admin/line", "/api/cron/nudges", "/api/go/share", "/api/health"]) {
      expect(hiddenInCore(p), p).toBe(false);
    }
  });

  it("hides everything outside the slice", () => {
    for (const p of ["/hospital", "/hospital/a1", "/ed", "/revenue", "/templates", "/inbox", "/practice", "/practice/c/1", "/visit", "/barn", "/shared/s1", "/c/tok", "/x/tok", "/api/claims", "/api/v1/notes", "/api/whatsapp/incoming", "/api/practice/x", "/api/voice/practice", "/api/encounters/e1/claim", "/api/encounters/e1/coding", "/api/encounters/e1/orders", "/api/patients/p1/records", "/api/admin/sso", "/api/admin/webhooks"]) {
      expect(hiddenInCore(p), p).toBe(true);
    }
  });

  it("does not confuse similar prefixes", () => {
    expect(hiddenInCore("/care")).toBe(false);
    expect(hiddenInCore("/settings")).toBe(false);
    expect(hiddenInCore("/edit")).toBe(false);
    expect(hiddenInCore("/api/encounters")).toBe(false);
  });
});
