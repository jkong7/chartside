import { describe, expect, it } from "vitest";
import { clientIp, limited, resetLimits } from "@/lib/server/ratelimit";

describe("rate limits", () => {
  it("allows up to the limit per key and window, then refuses", () => {
    resetLimits();
    for (let i = 0; i < 3; i++) expect(limited("k:a", 3, 60000)).toBe(false);
    expect(limited("k:a", 3, 60000)).toBe(true);
    expect(limited("k:b", 3, 60000)).toBe(false);
    expect(limited("k:c", 1, -1)).toBe(false);
    expect(limited("k:c", 1, -1)).toBe(false);
  });

  it("reads the address our proxy added, not one the client made up", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } });
    expect(clientIp(req)).toBe("203.0.113.9");
    process.env.CHARTSIDE_PROXY_HOPS = "2";
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" } }))).toBe("203.0.113.9");
    delete process.env.CHARTSIDE_PROXY_HOPS;
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
