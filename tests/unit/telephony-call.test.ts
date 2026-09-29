import { describe, expect, it } from "vitest";
import { ScribeCall, LINES, type CallDeps } from "../../src/lib/server/telephony/call";
import { affirmative, negative, reviewIntent, wakeCommand } from "../../src/lib/server/telephony/intents";

function harness(over: Partial<CallDeps> = {}) {
  const said: string[] = [];
  const events: string[] = [];
  const deps: CallDeps = {
    say: async (t) => void said.push(t),
    hangup: () => void events.push("hangup"),
    caller: { name: "Dr. Kong", guest: false },
    nextVisit: async () => null,
    open: async (i) => void events.push(`open:${i.encounterId ?? "new"}`),
    flush: async () => void events.push("flush"),
    finish: async () => void events.push("finish"),
    waitForNote: async () => ({ spoken: "Assessment: hypertension, at goal." }),
    converse: async (t) => `Changed: ${t}.`,
    markReady: async () => void events.push("ready"),
    textLink: async (r) => void events.push(`text:${r}`),
    declined: async () => void events.push("declined"),
    log: (e) => void events.push(e),
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
  });

  it("classifies review replies", () => {
    expect(reviewIntent("Looks good, ready to sign").kind).toBe("ready");
    expect(reviewIntent("Looks good but change the plan").kind).toBe("other");
    expect(reviewIntent("Text me the link").kind).toBe("later");
    expect(reviewIntent("Can you repeat that").kind).toBe("repeat");
    expect(reviewIntent("Make the plan shorter")).toEqual({ kind: "other", text: "Make the plan shorter" });
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
    await call.onTranscript("Yes that's okay");
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

  it("confirms the scheduled patient and captures into that visit", async () => {
    const { call, said, events } = harness({ nextVisit: async () => ({ encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez, follow-up for diabetes." }) });
    await call.start();
    expect(call.state).toBe("confirmPatient");
    expect(said[0]).toContain("Maria Lopez");
    await call.onTranscript("yes");
    expect(call.state).toBe("consent");
    await call.onDigit("2");
    expect(events).toContain("open:enc_9");
  });

  it("drops the scheduled visit when the clinician says no", async () => {
    const { call, events } = harness({ nextVisit: async () => ({ encounterId: "enc_9", spoken: "Your 2:40 is Maria Lopez." }) });
    await call.start();
    await call.onTranscript("no, someone else");
    await call.onTranscript("they agreed");
    expect(events).toContain("open:new");
  });

  it("stops and records nothing when the patient declines", async () => {
    const { call, said, events } = harness();
    await call.start();
    await call.onTranscript("No, I don't want that");
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
    const { call, said } = harness({ caller: { name: null, guest: true }, nextVisit: async () => ((looked = true), null) });
    await call.start();
    expect(looked).toBe(false);
    expect(said[0]).toContain("nothing to sign up for");
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
