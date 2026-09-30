import { describe, expect, it } from "vitest";
import { navMode, ownSigned, SIMPLE_NAV_HREFS, SIMPLE_NAV_UNTIL_SIGNED, SURVEY_AFTER_SIGNED } from "@/lib/nav";

const base = { role: "owner" as const, simpleNav: true, signedByMe: 0, teamSize: 1 };

describe("progressive nav disclosure", () => {
  it("shows a new solo clinician the simple nav", () => {
    expect(navMode(base)).toBe("simple");
    expect(navMode({ ...base, role: "clinician", teamSize: 4 })).toBe("simple");
    expect(SIMPLE_NAV_HREFS).toEqual(["/go", "/go/stack", "/patients", "/settings"]);
  });

  it("opens every tool after three signed notes", () => {
    expect(navMode({ ...base, signedByMe: SIMPLE_NAV_UNTIL_SIGNED - 1 })).toBe("simple");
    expect(navMode({ ...base, signedByMe: SIMPLE_NAV_UNTIL_SIGNED })).toBe("full");
  });

  it("keeps the full nav for existing accounts and anyone who chose to see all tools", () => {
    expect(navMode({ ...base, simpleNav: undefined })).toBe("full");
    expect(navMode({ ...base, simpleNav: false })).toBe("full");
  });

  it("keeps the full nav for admins, team owners and non-clinician roles", () => {
    expect(navMode({ ...base, role: "admin" })).toBe("full");
    expect(navMode({ ...base, teamSize: 2 })).toBe("full");
    for (const role of ["nurse", "scribe", "coder", "viewer"] as const) expect(navMode({ ...base, role })).toBe("full");
  });

  it("does not count sample clinic notes as the clinician's own", () => {
    expect(ownSigned(11, 11)).toBe(0);
    expect(ownSigned(14, 11)).toBe(3);
    expect(ownSigned(2, undefined)).toBe(2);
    expect(ownSigned(1, 5)).toBe(0);
  });

  it("waits for five signed notes before asking for a rating", () => {
    expect(SURVEY_AFTER_SIGNED).toBe(5);
  });
});
