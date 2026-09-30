import { describe, expect, it } from "vitest";
import { ScribeCall, LINES, type CallDeps } from "../../src/lib/server/telephony/call";
import type { PracticeLine } from "../../src/lib/server/telephony/practice";

function harness(over: Partial<CallDeps> = {}, practiceOver: Partial<PracticeLine> = {}) {
  const said: { text: string; voice?: string }[] = [];
  const events: string[] = [];
  const practice: PracticeLine = {
    menu: "Practice mode. Press 1 for chest pain.",
    limitMs: () => 60_000,
    voice: () => "aura-2-arcas-en",
    pick: async (c) => (c === "1" || /chest/i.test(c) ? "Chest pain. Go ahead and introduce yourself." : null),
    ask: async (t) => (events.push(`ask:${t}`), { reply: `Patient: ${t.length}`, ended: false }),
    finish: async (r) => (events.push(`finish:${r}`), "Encounter over. Goodbye."),
    ...practiceOver,
  };
  const deps: CallDeps = {
    say: async (text, _lang, voice) => void said.push({ text, voice }),
    hangup: () => void events.push("hangup"),
    caller: { name: null, guest: true, hasPin: false },
    verifyPin: async () => false,
    nextVisit: async () => null,
    open: async () => void events.push("open"),
    flush: async () => {},
    finish: async () => void events.push("capture_finish"),
    waitForNote: async () => null,
    converse: async () => "",
    markReady: async () => {},
    textLink: async () => true,
    abandon: async () => {},
    declined: async () => {},
    log: (e) => void events.push(e),
    echoWindowMs: 0,
    practice,
    ...over,
  };
  return { call: new ScribeCall(deps), said, events };
}

describe("practice on the phone line", () => {
  it("offers practice to first-time callers only", async () => {
    const guest = harness();
    await guest.call.start();
    expect(guest.said[0].text).toContain(LINES.practiceTip);
    const known = harness({ caller: { name: "Dr. Kong", guest: false, hasPin: false } });
    await known.call.start();
    expect(known.said[0].text).not.toContain(LINES.practiceTip);
    const off = harness({ practice: undefined });
    await off.call.start();
    expect(off.said[0].text).not.toContain("Press 7");
  });

  it("runs a case by keypad: menu, pick, questions in the patient voice, then end with 5", async () => {
    const { call, said, events } = harness();
    await call.start();
    await call.onDigit("7");
    expect(call.state).toBe("practice");
    expect(said.at(-1)!.text).toBe("Practice mode. Press 1 for chest pain.");
    await call.onDigit("9");
    expect(said.at(-1)!.text).toBe(`${LINES.practiceAgain} Practice mode. Press 1 for chest pain.`);
    await call.onDigit("1");
    expect(said.at(-1)!.text).toMatch(/introduce yourself/);
    await call.onTranscript("What brings you in today?");
    expect(events).toContain("ask:What brings you in today?");
    expect(said.at(-1)).toEqual({ text: "Patient: 25", voice: "aura-2-arcas-en" });
    await call.onDigit("5");
    expect(events.slice(-2)).toEqual(["finish:done", "hangup"]);
    expect(said.at(-1)!.text).toBe("Encounter over. Goodbye.");
    expect(call.state).toBe("ended");
    expect(events).not.toContain("open");
  });

  it("starts by voice and ends on 'end encounter' without recording anything", async () => {
    const { call, said, events } = harness();
    await call.start();
    await call.onTranscript("I'd like to practice.");
    expect(call.state).toBe("practice");
    await call.onTranscript("Chest pain, please");
    await call.onTranscript("Okay, end encounter.");
    expect(events).toContain("finish:done");
    expect(events).not.toContain("open");
    expect(said.at(-1)!.text).toBe("Encounter over. Goodbye.");
  });

  it("ignores 'practice' in normal room talk and never starts practice without the dependency", async () => {
    const a = harness();
    await a.call.start();
    await a.call.onTranscript("Our practice has been busy this week.");
    expect(a.call.state).toBe("consent");
    const b = harness({ practice: undefined });
    await b.call.start();
    await b.call.onDigit("7");
    expect(b.call.state).toBe("consent");
  });

  it("scores the case when the caller hangs up mid-encounter or time runs out", async () => {
    const h = harness();
    await h.call.start();
    await h.call.onDigit("7");
    await h.call.onDigit("1");
    await h.call.onHangup();
    expect(h.events).toContain("finish:hangup");
    const t = harness({}, { limitMs: () => 30 });
    await t.call.start();
    await t.call.onDigit("7");
    await t.call.onDigit("1");
    await new Promise((r) => setTimeout(r, 120));
    expect(t.events).toContain("finish:time");
    expect(t.events.at(-1)).toBe("hangup");
  });

  it("finishes when the patient session reports time is up", async () => {
    const h = harness({}, { ask: async () => ({ reply: "", ended: true }) });
    await h.call.start();
    await h.call.onDigit("7");
    await h.call.onDigit("1");
    await h.call.onTranscript("When did it start?");
    expect(h.events).toContain("finish:time");
  });
});

describe("case picking", () => {
  it("maps keypad digits and spoken names to cases", async () => {
    const { pickCase, PRACTICE_MENU } = await import("../../src/lib/server/telephony/practice");
    expect(pickCase("1")?.id).toBe("chest-pain");
    expect(pickCase("8")?.id).toBe("shortness-of-breath");
    expect(pickCase("9")).toBeNull();
    expect(pickCase("the headache one")?.id).toBe("headache");
    expect(pickCase("number six")?.id).toBe("pediatric-fever");
    expect(pickCase("banana")).toBeNull();
    expect(PRACTICE_MENU).toContain("press 6 for fever in a toddler");
  });
});
