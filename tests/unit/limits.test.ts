import { describe, expect, it } from "vitest";
import { isStuck, recordingLimit, recordingMinutesFromEnv } from "@/lib/engine/limits";

describe("long visits and stuck sessions", () => {
  it("warns 30 minutes before the cap and stops at it", () => {
    expect(recordingLimit(60 * 60)).toEqual({ state: "ok", remainingMinutes: 60 });
    expect(recordingLimit(91 * 60)).toEqual({ state: "warn", remainingMinutes: 29 });
    expect(recordingLimit(120 * 60)).toEqual({ state: "limit", remainingMinutes: 0 });
    expect(recordingLimit(16 * 60, 20).state).toBe("warn");
    expect(recordingLimit(14 * 60, 20).state).toBe("ok");
  });

  it("reads the cap from the environment within sane bounds", () => {
    expect(recordingMinutesFromEnv("90")).toBe(90);
    expect(recordingMinutesFromEnv("2")).toBe(120);
    expect(recordingMinutesFromEnv(undefined)).toBe(120);
  });

  it("treats a note still drafting three minutes after the visit ended as stuck", () => {
    const at = Date.parse("2026-09-28T12:00:00Z");
    expect(isStuck({ status: "processing", endedAt: "2026-09-28T11:56:00Z" }, at)).toBe(true);
    expect(isStuck({ status: "processing", endedAt: "2026-09-28T11:58:30Z" }, at)).toBe(false);
    expect(isStuck({ status: "review", endedAt: "2026-09-28T10:00:00Z" }, at)).toBe(false);
  });
});
