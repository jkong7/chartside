import { describe, expect, it } from "vitest";
import { ScribeCall, LINES, type CallDeps } from "../../src/lib/server/telephony/call";
import { affirmative, negative, reviewIntent, wakeCommand } from "../../src/lib/server/telephony/intents";

function harness(over: Partial<CallDeps> = {}) {
  const said: string[] = [];
  const events: string[] = [];
  const deps: CallDeps = {
    say: async (t, lang) => void said.push(lang === "es" ? `[es] ${t}` : t),
    hangup: () => void events.push("hangup"),
    caller: { name: "Dr. Kong", guest: false, hasPin: false },
    verifyPin: async (p) => p === "4812",
    nextVisit: async () => null,
    open: async (i) => void events.push(`open:${i.encounterId ?? "new"}${i.lang ? `:${i.lang}` : ""}`),
    flush: async () => void events.push("flush"),
    finish: async () => void events.push("finish"),
    waitForNote: async () => ({ spoken: "Assessment: hypertension, at goal." }),
    converse: async (t) => `Changed: ${t}.`,
    markReady: async () => void events.push("ready"),
    textLink: async (r) => (events.push(`text:${r}`), true),
    abandon: async () => void events.push("abandon"),
    declined: async () => void events.push("declined"),
    log: (e) => void events.push(e),
    echoWindowMs: 0,
    ...over,
  };
  return { call: new ScribeCall(deps), said, events };
}

describe("phone intents", () => {
  it("reads consent answers", () => {
    expect(affirmative("Yeah that's fine")).toBe(true);
    expect(affirmative("She agreed")).toBe(true);
    expect(affirmative("No, I'd rather not")).toBe(false);
    expect(negative("No, I'd rather not")).toBe(true);
    expect(negative("no problem")).toBe(false);
    expect(affirmative("no problem")).toBe(true);
    expect(affirmative("um let me think")).toBe(false);
  });

  it("needs the wake word for commands", () => {
    expect(wakeCommand("okay let's end the visit here")).toBeNull();
    expect(wakeCommand("Chartside, end visit.")).toBe("end");
    expect(wakeCommand("chart side pause")).toBe("pause");
    expect(wakeCommand("Chartside resume please")).toBe("resume");
    expect(wakeCommand("chartside what's up")).toBeNull();
    expect(wakeCommand("Chartside and visit.")).toBe("end");
  });

  it("classifies review replies", () => {
    expect(reviewIntent("Looks good, ready to sign").kind).toBe("ready");
    expect(reviewIntent("Looks good but change the plan").kind).toBe("other");
    expect(reviewIntent("Text me the link").kind).toBe("later");
    expect(reviewIntent("Can you repeat that").kind).toBe("repeat");
    expect(reviewIntent("Make the plan shorter")).toEqual({ kind: "other", text: "Make the plan shorter" });
    expect(reviewIntent("Text the patient their summary").kind).toBe("summary");
    expect(reviewIntent("send her summary").kind).toBe("summary");
  });
});

describe("scribe call", () => {
  it("runs consent, recording, end, review and ready", async () => {
    const { call, said, events } = harness();
    await call.start();
    expect(call.state).toBe("consent");
    expect(said[0]).toContain("Hi Dr. Kong");
    call.onAudio();
    await call.onTranscript("um hello");
    expect(call.state).toBe("consent");
    await call.onTranscript("Is it okay if I record our visit?");
    expect(call.state).toBe("consent");
    await call.onTranscript("Okay, have a seat.");
    expect(call.state).toBe("consent");
    await call.onTranscript("She agreed.");
    expect(call.state).toBe("recording");
    expect(events).toContain("open:new");
    call.onAudio();
    await call.onTranscript("so no chest pain and yes the cough is better");
    expect(call.state).toBe("recording");
    await call.onTranscript("Chartside, end visit");
    expect(events).toContain("finish");
    expect(call.state).toBe("review");
    expect(said.at(-1)).toContain("hypertension");
    await call.onTranscript("make the plan shorter");
    expect(said.at(-1)).toContain("Changed: make the plan shorter");
    await call.onTranscript("looks good");
    expect(events).toEqual(expect.arrayContaining(["ready", "text:ready", "hangup"]));
    expect(call.state).toBe("ended");
  });

  it("never reads the schedule without a PIN", async () => {
    let looked = false;
    const { call, said } = harness({ nextVisit: async () => ((looked = true), { encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez." }) });
    await call.start();
    expect(looked).toBe(false);
    expect(call.state).toBe("consent");
    expect(said.join(" ")).not.toContain("Maria");
  });

  it("falls back to record-only on a wrong PIN without saying why", async () => {
    let looked = false;
    const { call, said } = harness({ caller: { name: "Dr. Kong", guest: false, hasPin: true }, nextVisit: async () => ((looked = true), { encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez." }) });
    await call.start();
    expect(call.state).toBe("pin");
    for (const d of "1111#") await call.onDigit(d);
    expect(looked).toBe(false);
    expect(call.state).toBe("consent");
    expect(said.at(-1)).toContain("didn't match");
    expect(said.join(" ")).not.toMatch(/locked/i);
  });

  it("skips the PIN with star", async () => {
    const { call } = harness({ caller: { name: "Dr. Kong", guest: false, hasPin: true } });
    await call.start();
    await call.onDigit("*");
    expect(call.state).toBe("consent");
  });

  it("confirms the scheduled patient after a PIN and captures into that visit", async () => {
    const { call, said, events } = harness({ caller: { name: "Dr. Kong", guest: false, hasPin: true }, nextVisit: async () => ({ encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez, follow-up for diabetes." }) });
    await call.start();
    for (const d of "4812#") await call.onDigit(d);
    expect(call.state).toBe("confirmPatient");
    expect(said.at(-1)).toContain("Maria Lopez");
    await call.onTranscript("yes");
    expect(call.state).toBe("consent");
    await call.onDigit("2");
    expect(events).toContain("open:enc_9");
  });

  it("drops the scheduled visit when the clinician says no", async () => {
    const { call, events } = harness({ caller: { name: "Dr. Kong", guest: false, hasPin: true }, nextVisit: async () => ({ encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez." }) });
    await call.start();
    for (const d of "4812#") await call.onDigit(d);
    await call.onTranscript("no, someone else");
    await call.onTranscript("They agreed.");
    expect(events).toContain("open:new");
  });

  it("keeps the opening short and reads the consent script to the patient on 3", async () => {
    const { call, said } = harness();
    await call.start();
    expect(said[0].split(/\s+/).length).toBeLessThan(40);
    await call.onDigit("3");
    expect(said.at(-1)).toBe(LINES.consentScript);
    await call.onTranscript("You can say yes, or no.");
    expect(call.state).toBe("consent");
    await call.onTranscript("Yes, that's fine");
    expect(call.state).toBe("recording");
  });

  it("asks the patient in Spanish on 9 and records the visit as multilingual", async () => {
    const { call, said, events } = harness();
    await call.start();
    await call.onDigit("9");
    expect(said.at(-1)).toBe(`[es] ${LINES.consentScriptEs}`);
    await call.onTranscript("Sí, está bien.");
    expect(call.state).toBe("recording");
    expect(events).toContain("open:new:multi");
  });

  it("hears a Spanish no as a decline", async () => {
    const { call, events } = harness();
    await call.start();
    await call.onDigit("9");
    await call.onTranscript("No, prefiero que no.");
    expect(events).toContain("declined");
  });

  it("stops and records nothing when the patient declines", async () => {
    const { call, said, events } = harness();
    await call.start();
    await call.onTranscript("No, I don't think so, let me check the chart");
    expect(call.state).toBe("consent");
    await call.onTranscript("She declined.");
    expect(events).toEqual(expect.arrayContaining(["declined", "hangup"]));
    expect(events).not.toContain("open:new");
    expect(said.at(-1)).toBe(LINES.declined);
  });

  it("uses the dictation keypad: 2 record, 4 pause, 2 resume, 5 end", async () => {
    const { call, events } = harness();
    await call.start();
    await call.onDigit("2");
    expect(call.state).toBe("recording");
    await call.onDigit("4");
    expect(call.state).toBe("paused");
    expect(events).toContain("flush");
    await call.onDigit("2");
    expect(call.state).toBe("recording");
    await call.onDigit("5");
    expect(call.state).toBe("review");
    await call.onDigit("1");
    expect(events).toContain("ready");
  });

  it("finishes and texts when the caller hangs up mid-visit", async () => {
    const { call, events } = harness();
    await call.start();
    await call.onDigit("2");
    call.onAudio();
    await call.onHangup();
    expect(events).toEqual(expect.arrayContaining(["finish", "text:processing"]));
  });

  it("does nothing on hangup before consent", async () => {
    const { call, events } = harness();
    await call.start();
    await call.onHangup();
    expect(events).not.toContain("finish");
    expect(events.filter((e) => e.startsWith("text:"))).toEqual([]);
  });

  it("texts instead of reading when the note is slow", async () => {
    const { call, said, events } = harness({ waitForNote: async () => null });
    await call.start();
    await call.onDigit("2");
    await call.onTranscript("Chartside end visit");
    expect(said.at(-1)).toBe(LINES.slow);
    expect(events).toEqual(expect.arrayContaining(["text:processing", "hangup"]));
  });

  it("greets guests with the free offer and no schedule lookup", async () => {
    let looked = false;
    const { call, said } = harness({ caller: { name: null, guest: true, hasPin: false }, nextVisit: async () => ((looked = true), null) });
    await call.start();
    expect(looked).toBe(false);
    expect(said[0]).toContain("nothing to sign up for");
  });

  it("ignores room chatter during read-back but answers requests aimed at it", async () => {
    let asked = "";
    const { call, said } = harness({ converse: async (t) => ((asked = t), `Changed: ${t}.`) });
    await call.start();
    await call.onDigit("2");
    await call.onDigit("5");
    const n = said.length;
    await call.onTranscript("Hi Maria, good to see you again. How have things been?");
    await call.onTranscript("Pretty good honestly, my stomach was upset the first week.");
    expect(said.length).toBe(n);
    expect(asked).toBe("");
    await call.onTranscript("Chartside, add a follow up in three months.");
    expect(asked).toBe("add a follow up in three months.");
    await call.onTranscript("Make the plan shorter");
    expect(asked).toBe("Make the plan shorter");
    await call.onTranscript("What code did you pick?");
    expect(asked).toBe("What code did you pick?");
  });

  it("ends and drafts the visit when the recording limit is reached", async () => {
    const { call, said, events } = harness();
    await call.start();
    await call.onDigit("2");
    await call.onLimit();
    expect(said).toContain(LINES.limit);
    expect(events).toContain("finish");
    expect(call.state).toBe("review");
    await call.onLimit();
    expect(said.filter((x) => x === LINES.limit)).toHaveLength(1);
  });

  it("never takes its own prompt heard through the speaker as consent", async () => {
    const { call } = harness();
    await call.start();
    await call.onTranscript("When your patient agrees to be recorded, say they agreed, or press 2.");
    expect(call.state).toBe("consent");
  });

  it("joins a wake word and command split across two transcripts", async () => {
    const { call } = harness();
    await call.start();
    await call.onDigit("2");
    await call.onTranscript("Chartside,");
    expect(call.state).toBe("recording");
    await call.onTranscript("end visit.");
    expect(call.state).toBe("review");
  });

  it("tells the caller when the text couldn't be sent instead of going silent", async () => {
    const { call, said } = harness({ textLink: async () => false });
    await call.start();
    await call.onDigit("2");
    await call.onDigit("5");
    await call.onTranscript("ready");
    expect(said.at(-1)).toBe(LINES.readyNoText);
    expect(call.state).toBe("ended");
  });

  it("falls back to a new visit when the scheduled one can't be recorded, and hangs up cleanly if nothing works", async () => {
    let tries = 0;
    const { call, events } = harness({
      caller: { name: "Dr. Kong", guest: false, hasPin: true },
      nextVisit: async () => ({ encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez." }),
      open: async (i) => {
        tries++;
        if (i.encounterId) throw new Error("This visit has already been recorded");
        events.push("open:new");
      },
    });
    await call.start();
    for (const d of "4812#") await call.onDigit(d);
    await call.onTranscript("yes");
    await call.onDigit("2");
    expect(tries).toBe(2);
    expect(call.state).toBe("recording");
    const broken = harness({ open: async () => { throw new Error("db down"); } });
    await broken.call.start();
    await broken.call.onDigit("2");
    expect(broken.said.at(-1)).toBe(LINES.openFailed);
    expect(broken.events).toContain("hangup");
  });

  it("drops the empty visit when the caller hangs up right after consent", async () => {
    const { call, events } = harness();
    await call.start();
    await call.onDigit("2");
    await call.onHangup();
    expect(events).toContain("abandon");
    expect(events).not.toContain("finish");
  });

  it("answers chart questions before a visit only after a PIN and only when addressed by name", async () => {
    let asked = "";
    const pinned = harness({ caller: { name: "Dr. Kong", guest: false, hasPin: true }, ask: async (t) => ((asked = t), "You have 3 notes to sign.") });
    await pinned.call.start();
    for (const d of "4812#") await pinned.call.onDigit(d);
    await pinned.call.onTranscript("What's left today?");
    expect(asked).toBe("");
    await pinned.call.onTranscript("Chartside, what's left today?");
    expect(asked).toBe("what's left today?");
    expect(pinned.said.at(-1)).toBe(`You have 3 notes to sign. ${LINES.askMore}`);
    expect(pinned.call.state).toBe("consent");
    const open = harness({ ask: async () => "should not be asked" });
    await open.call.start();
    await open.call.onTranscript("Chartside, what's left today?");
    expect(open.said.at(-1)).toBe(LINES.askNeedsPin);
  });

  it("fills a long wait for the note with short cues so the line never goes silent", async () => {
    const { call, said } = harness({ fillerMs: 20, waitForNote: () => new Promise((r) => setTimeout(() => r({ spoken: "Here's your note." }), 70)) });
    await call.start();
    await call.onDigit("2");
    await call.onDigit("5");
    expect(said.filter((x) => x === LINES.stillWriting || x === LINES.almostThere).length).toBeGreaterThanOrEqual(2);
    expect(said.at(-1)).toContain("Here's your note.");
    expect(call.state).toBe("review");
  });

  it("moves on to the next patient on the same call", async () => {
    let resets = 0;
    const visits = [{ encounterId: "enc_2", spoken: "Your 3:00 is Ana Ruiz." }];
    const { call, said, events } = harness({
      caller: { name: "Dr. Kong", guest: false, hasPin: true },
      nextVisit: async () => visits.shift() ?? null,
      startNext: () => void resets++,
    });
    await call.start();
    await call.onDigit("*");
    await call.onDigit("2");
    await call.onDigit("5");
    expect(call.state).toBe("review");
    await call.onTranscript("next patient");
    expect(resets).toBe(1);
    expect(events).toEqual(expect.arrayContaining(["ready", "text:ready"]));
    expect(call.state).toBe("consent");
    expect(said.at(-1)).toContain("Next patient.");
    await call.onDigit("2");
    expect(call.state).toBe("recording");
    await call.onDigit("5");
    await call.onDigit("8");
    expect(resets).toBe(2);
  });

  it("warns about a quiet room only while recording", async () => {
    const { call, said } = harness();
    await call.start();
    await call.onQuiet();
    expect(said).not.toContain(LINES.lowAudio);
    await call.onDigit("2");
    await call.onQuiet();
    expect(said.at(-1)).toBe(LINES.lowAudio);
  });

  it("repeats the last line on request", async () => {
    const { call, said } = harness();
    await call.start();
    await call.onDigit("2");
    await call.onDigit("5");
    const summary = said.at(-1);
    await call.onTranscript("say that again");
    expect(said.at(-1)).toBe(summary);
  });
});

import { spokenBrief, speakable } from "../../src/lib/server/telephony/brief";

describe("spoken note brief", () => {
  it("reads numbered assessment lines as sentences", () => {
    expect(speakable("1. Acute URI .\n2. Cough, BID PRN")).toBe("Acute URI. Cough, twice daily as needed");
  });

  it("summarizes assessment, plan and coding without codes in brackets", () => {
    const text = spokenBrief({ sections: [{ key: "assessment", title: "Assessment", text: "Type 2 diabetes (E11.9), improving. Hypertension, at goal." }, { key: "plan", title: "Plan", text: "A1c in 3 months.\nContinue metformin." }], codes: { em: "99214", diagnoses: [{ code: "E11.9", label: "T2DM" }, { code: "I10", label: "HTN" }] } }, 12);
    expect(text).toContain("12-minute visit");
    expect(text).toContain("Assessment: Type 2 diabetes, improving.");
    expect(text).toContain("Plan: A1c in 3 months. Continue metformin.");
    expect(text).toContain("level 4 visit");
    expect(text).toContain("2 diagnoses coded");
    expect(text).not.toContain("E11.9");
  });

  it("caps long sections", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const text = spokenBrief({ sections: [{ key: "assessment_plan", title: "Assessment and Plan", text: long }], codes: null });
    expect(text.split(/\s+/).length).toBeLessThan(60);
  });
});

describe("remote control from a screen", () => {
  it("pauses, resumes and ends a recording visit, and ignores other states", async () => {
    const { call, events } = harness();
    await call.start();
    await call.remote("pause");
    expect(call.state).toBe("consent");
    await call.onDigit("2");
    await call.remote("pause");
    expect(call.state).toBe("paused");
    await call.remote("resume");
    expect(call.state).toBe("recording");
    await call.remote("end");
    expect(events).toContain("finish");
    expect(call.state).toBe("review");
  });
});
