import { describe, expect, it } from "vitest";
import { clockTime, dayBounds, localDay, localHour, tzOf, validTz, wallTime, zonedTime } from "@/lib/tz";

describe("time zone helpers", () => {
  it("accepts real IANA zones and rejects junk", () => {
    expect(validTz("America/Los_Angeles")).toBe(true);
    expect(validTz("America/Argentina/Buenos_Aires")).toBe(true);
    expect(validTz("UTC")).toBe(true);
    expect(validTz("Mars/Olympus")).toBe(false);
    expect(validTz("")).toBe(false);
    expect(validTz("x;document.cookie")).toBe(false);
    expect(validTz(42)).toBe(false);
  });

  it("prefers the user's saved zone, then the fallback, then the clinic zone", () => {
    const prev = process.env.CHARTSIDE_TZ;
    process.env.CHARTSIDE_TZ = "America/Denver";
    expect(tzOf({ prefs: { tz: "Asia/Tokyo" } }, "Europe/London")).toBe("Asia/Tokyo");
    expect(tzOf({ prefs: {} }, "Europe/London")).toBe("Europe/London");
    expect(tzOf({ prefs: { tz: "Nope/Zone" } }, null)).toBe("America/Denver");
    expect(tzOf(null)).toBe("America/Denver");
    process.env.CHARTSIDE_TZ = "garbage";
    expect(tzOf(null)).toBe("America/Chicago");
    process.env.CHARTSIDE_TZ = prev;
  });

  it("formats a clock time in the viewer's zone, not the server's", () => {
    const at = "2026-09-30T06:17:00Z";
    expect(clockTime(at, "America/Chicago")).toBe("1:17 AM");
    expect(clockTime(at, "America/Los_Angeles")).toBe("11:17 PM");
    expect(clockTime(at, "Asia/Kolkata")).toBe("11:47 AM");
  });

  it("builds wall-clock times so a demo day lands in local business hours", () => {
    const now = new Date("2026-09-30T20:00:00Z");
    for (const tz of ["America/Los_Angeles", "America/New_York", "America/Chicago", "Europe/Berlin", "Australia/Sydney"]) {
      const d = wallTime(0, "08:30", tz, now);
      expect(clockTime(d, tz)).toBe("8:30 AM");
      expect(localDay(d, tz)).toBe(localDay(now, tz));
      expect(localHour(wallTime(3, "15:45", tz, now), tz)).toBe(15);
    }
  });

  it("handles days that cross a daylight saving change", () => {
    const d = zonedTime("2026-11-01", "09:00", "America/Chicago");
    expect(d.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    const s = zonedTime("2026-03-08", "09:00", "America/Chicago");
    expect(s.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("returns local midnight bounds for the day", () => {
    const b = dayBounds(new Date("2026-09-30T03:00:00Z"), "America/Los_Angeles");
    expect(b.from).toBe("2026-09-29T07:00:00.000Z");
    expect(b.to).toBe("2026-09-30T07:00:00.000Z");
  });
});
