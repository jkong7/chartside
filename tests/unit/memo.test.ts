import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audioSeconds, mediaItems, mediaResourceUrl, mediaUrlAllowed } from "@/lib/engine/media";
import { dictationText, formatClock, holdExpiry, memoIntent, nextHold, splitMessage, splitNumbered, type MemoHoldState } from "@/lib/engine/memo";

const fixture = (f: string) => readFileSync(`tests/e2e/fixtures/${f}`);

describe("twilio media fields", () => {
  it("lists every attachment and flags audio, including carrier video/3gpp", () => {
    const items = mediaItems({ NumMedia: "3", MediaUrl0: "https://api.twilio.com/a", MediaContentType0: "audio/amr", MediaUrl1: "https://api.twilio.com/b", MediaContentType1: "video/3gpp", MediaUrl2: "https://api.twilio.com/c", MediaContentType2: "image/jpeg" });
    expect(items.map((i) => [i.index, i.audio])).toEqual([[0, true], [1, true], [2, false]]);
    expect(mediaItems({ NumMedia: "0" })).toEqual([]);
    expect(mediaItems({ NumMedia: "2", MediaUrl0: "https://api.twilio.com/a", MediaContentType0: "audio/ogg; codecs=opus" })[0].contentType).toBe("audio/ogg");
  });

  it("only fetches media from the configured Twilio host and media path", () => {
    const base = "https://api.twilio.com";
    expect(mediaUrlAllowed("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM456/Media/ME789", base)).toBe(true);
    expect(mediaUrlAllowed("https://evil.test/2010-04-01/Accounts/AC123/Messages/MM456/Media/ME789", base)).toBe(false);
    expect(mediaUrlAllowed("https://api.twilio.com/2010-04-01/Accounts/AC123/Calls/CA1", base)).toBe(false);
    expect(mediaUrlAllowed("http://169.254.169.254/latest", base)).toBe(false);
    expect(mediaUrlAllowed("not a url", base)).toBe(false);
    expect(mediaResourceUrl("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1?x=1")).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1.json");
  });

  it("reads the length of wav, m4a, ogg and amr recordings", () => {
    expect(audioSeconds(fixture("visit.wav"), "audio/wav")).toBeCloseTo(22.1, 0);
    expect(audioSeconds(fixture("memo.m4a"), "audio/mp4")).toBeCloseTo(14, 0);
    expect(audioSeconds(fixture("voice.ogg"), "audio/ogg")).toBeCloseTo(14, 0);
    const amr = Buffer.concat([Buffer.from("#!AMR\n"), ...Array.from({ length: 150 }, () => Buffer.from([0x3c, ...Buffer.alloc(31)]))]);
    expect(audioSeconds(amr, "audio/amr")).toBeCloseTo(3, 1);
    expect(audioSeconds(Buffer.from("junk"), "audio/wav")).toBeNull();
  });

  it("formats a recording length like a phone does", () => {
    expect(formatClock(134)).toBe("2:14");
    expect(formatClock(5.4)).toBe("0:05");
    expect(formatClock(null)).toBeNull();
    expect(formatClock(0)).toBeNull();
  });
});

describe("what a text means", () => {
  it("separates consent replies, uploads, dictation and commands", () => {
    expect(memoIntent("YES")).toBe("yes");
    expect(memoIntent("y")).toBe("yes");
    expect(memoIntent("No.")).toBe("no");
    expect(memoIntent("Always")).toBe("always");
    expect(memoIntent("always off")).toBe("other");
    expect(memoIntent("upload")).toBe("upload");
    expect(memoIntent("Note: knee pain better, continue PT, recheck 6 weeks")).toBe("note");
    expect(memoIntent("status")).toBe("other");
    expect(memoIntent("nudge 5pm")).toBe("other");
    expect(memoIntent("notes")).toBe("other");
    expect(memoIntent("what was Ruth's blood pressure")).toBe("other");
    const long = "Follow up for left knee osteoarthritis, pain down to three out of ten with physical therapy twice a week, exam shows mild effusion and full range of motion, plan continue therapy and recheck in six weeks";
    expect(memoIntent(long)).toBe("note");
    expect(dictationText("NOTE: knee better")).toBe("knee better");
  });
});

describe("consent hold", () => {
  const start = new Date("2026-09-30T12:00:00Z");
  const held: MemoHoldState = { status: "held", createdAt: start.toISOString(), expiresAt: holdExpiry(start, 24) };

  it("confirms on YES and discards on NO", () => {
    expect(nextHold(held, { kind: "yes" }, start).status).toBe("confirmed");
    expect(nextHold(held, { kind: "no" }, start).status).toBe("discarded");
    expect(nextHold(held, { kind: "tick" }, start).status).toBe("held");
  });

  it("discards once the hold expires, even if YES arrives late", () => {
    const late = new Date(start.getTime() + 24 * 3600_000 + 1);
    expect(nextHold(held, { kind: "tick" }, late).status).toBe("discarded");
    expect(nextHold(held, { kind: "yes" }, late).status).toBe("discarded");
  });

  it("never reopens a finished hold", () => {
    expect(nextHold({ ...held, status: "discarded" }, { kind: "yes" }, start).status).toBe("discarded");
    expect(nextHold({ ...held, status: "confirmed" }, { kind: "no" }, start).status).toBe("confirmed");
  });
});

describe("message splitting", () => {
  it("keeps short messages whole", () => {
    expect(splitMessage("hello")).toEqual(["hello"]);
    expect(splitMessage("   ")).toEqual([]);
  });

  it("splits long notes at line or sentence breaks under the limit", () => {
    const note = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: the horse was sound at the walk and trot on a straight line.`).join("\n");
    const parts = splitMessage(note, 1600);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(1600);
    expect(parts.join("\n")).toBe(note);
    const numbered = splitNumbered(note, 1600);
    expect(numbered[0]).toMatch(/^\(1\/\d\) Line 1/);
    for (const p of numbered) expect(p.length).toBeLessThanOrEqual(1600);
  });

  it("hard-splits a single giant word", () => {
    const parts = splitMessage("x".repeat(3500), 1600);
    expect(parts.map((p) => p.length)).toEqual([1600, 1600, 300]);
  });
});
