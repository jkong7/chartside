import { describe, expect, it } from "vitest";
import { DeepgramLive, SpeakerRoles, wordsToSegments, type DgWord } from "@/lib/audio/deepgram";
import { estimatePitch } from "@/lib/audio/features";
import { assignRoles, clusterVoices } from "@/lib/engine/diarize";
import { speakerScore } from "@/lib/engine/extract";
import { checkInterpretation } from "@/lib/engine/interpreter";
import { detectLang, numbersIn } from "@/lib/engine/lang";
import type { Utterance } from "@/lib/types";
import { demo } from "./helpers";

const u = (id: string, text: string, extra: Partial<Utterance> = {}): Utterance => ({ id, seq: Number(id.replace(/\D/g, "")) || 0, speaker: "patient", speakerSource: "auto", text, tStart: 0, tEnd: 1, ...extra });

describe("language detection", () => {
  it("tells Spanish from English", () => {
    expect(detectLang("Lo uso cada cuatro horas, casi todos los días.")).toBe("es");
    expect(detectLang("She uses it every six hours, almost every day.")).toBe("en");
    expect(detectLang("¿Ha tenido fiebre?")).toBe("es");
    expect(detectLang("Okay.")).toBe("und");
  });

  it("reads numbers in both languages", () => {
    expect(numbersIn("cada cuatro horas", "es")).toEqual([4]);
    expect(numbersIn("every six hours", "en")).toEqual([6]);
    expect(numbersIn("agregar tiotropio una vez al día", "es")).toEqual([1]);
    expect(numbersIn("once daily", "en")).toEqual([1]);
  });
});

describe("interpreter check", () => {
  it("flags the dosing discrepancy in the interpreted demo visit and nothing else", () => {
    const { d } = demo("morales");
    const utts = d.script.map((l, i) => u(`u${i}`, l.t, { speaker: l.s, lang: l.lang }));
    const r = checkInterpretation(utts);
    expect(r.interpreted).toBe(true);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].message).toBe("numbers differ (4 → 6)");
    expect(r.flags[0].sourceId).toBe("u6");
  });

  it("catches dropped negations, side, and medication names", () => {
    const r = checkInterpretation([
      u("u1", "No tengo dolor en la rodilla derecha.", { lang: "es", speaker: "patient" }),
      u("u2", "I have pain in the left knee.", { lang: "en", speaker: "other" }),
      u("u3", "Start lisinopril today.", { lang: "en", speaker: "clinician" }),
      u("u4", "Vamos a empezar metformina hoy.", { lang: "es", speaker: "other" }),
    ]);
    expect(r.flags.map((f) => f.message)).toEqual(["a negation was dropped in interpretation; side differs (right → left)", "medication names differ (lisinopril)"]);
  });
});

describe("speaker roles", () => {
  it("scores clinician and patient language", () => {
    expect(speakerScore("Let me take a listen to your lungs.")).toBeGreaterThan(0);
    expect(speakerScore("I've been feeling tired and my back hurts.")).toBeLessThan(0);
  });

  it("assigns clinician, patient, and interpreter to diarized speakers", () => {
    const { d } = demo("morales");
    const spk: Record<string, string> = { clinician: "0", other: "1", patient: "2" };
    const utts = d.script.map((l, i) => u(`u${i}`, l.t, { speaker: l.s, lang: l.lang }));
    const groups = ["0", "1", "2"].map((k) => ({ key: k, utterances: utts.filter((x) => spk[x.speaker] === k) }));
    expect(assignRoles(groups, utts)).toEqual({ "0": "clinician", "1": "other", "2": "patient" });
  });

  it("clusters two voices by pitch and timbre and maps them to roles", () => {
    const { utterances } = demo("carter");
    const withVoice = utterances.map((x) => ({
      ...x,
      speakerSource: "auto" as const,
      voice: x.speaker === "clinician" ? { pitch: 115 + (x.seq % 5), centroid: 1400 + (x.seq % 7) * 10, energy: 0.05, frames: 20 } : { pitch: 205 + (x.seq % 4), centroid: 2100 + (x.seq % 6) * 12, energy: 0.05, frames: 20 },
    }));
    const map = clusterVoices(withVoice)!;
    expect(map).not.toBeNull();
    const wrong = withVoice.filter((x) => map[x.id] !== x.speaker);
    expect(wrong).toHaveLength(0);
  });

  it("refuses to cluster when voices are indistinguishable", () => {
    const { utterances } = demo("carter");
    const same = utterances.map((x, i) => ({ ...x, voice: { pitch: 150 + (i % 3), centroid: 1800 + (i % 4), energy: 0.05, frames: 20 } }));
    expect(clusterVoices(same)).toBeNull();
  });

  it("assigns live Deepgram speakers on first appearance", () => {
    const r = new SpeakerRoles();
    expect(r.role(1, "What brings you in today?")).toBe("clinician");
    expect(r.role(0, "My knee hurts.")).toBe("patient");
    expect(r.role(1, "anything")).toBe("clinician");
    expect(r.role(2, "I'm her daughter.")).toBe("other");
  });
});

describe("Deepgram live results", () => {
  const w = (word: string, start: number, speaker: number): DgWord => ({ word, punctuated_word: word, start, end: start + 0.3, speaker, confidence: 0.9 });

  it("groups words into speaker segments", () => {
    const segs = wordsToSegments([w("Any", 0, 0), w("fever?", 0.3, 0), w("No.", 1, 1), w("Okay.", 1.5, 0)]);
    expect(segs.map((s) => [s.speaker, s.text])).toEqual([[0, "Any fever?"], [1, "No."], [0, "Okay."]]);
  });

  it("emits final segments on speech_final and offsets time", () => {
    const got: { text: string; start: number; role: string }[] = [];
    const interims: string[] = [];
    const live = new DeepgramLive("ws://x", "t", 30, { onSegment: (s) => got.push({ text: s.text, start: s.start, role: s.role }), onInterim: (t) => interims.push(t), onStatus: () => undefined });
    live.onMessage(JSON.stringify({ type: "Results", is_final: false, channel: { alternatives: [{ transcript: "What brings", confidence: 0.5, words: [] }] } }));
    live.onMessage(JSON.stringify({ type: "Results", is_final: true, speech_final: false, channel: { alternatives: [{ transcript: "What brings you in", confidence: 0.9, words: [w("What", 1, 0), w("brings", 1.3, 0), w("you", 1.6, 0), w("in?", 1.9, 0)] }] } }));
    expect(got).toHaveLength(0);
    live.onMessage(JSON.stringify({ type: "Results", is_final: true, speech_final: true, channel: { alternatives: [{ transcript: "My back hurts", confidence: 0.9, words: [w("My", 3, 1), w("back", 3.3, 1), w("hurts.", 3.6, 1)] }] } }));
    expect(got).toEqual([{ text: "What brings you in?", start: 31, role: "clinician" }, { text: "My back hurts.", start: 33, role: "patient" }]);
    expect(interims[0]).toBe("What brings");
  });
});

describe("pitch estimation", () => {
  it("recovers the fundamental of a synthetic voice", () => {
    const sr = 16000;
    const buf = new Float32Array(2048);
    for (let i = 0; i < buf.length; i++) buf[i] = 0.3 * Math.sin((2 * Math.PI * 180 * i) / sr) + 0.1 * Math.sin((2 * Math.PI * 360 * i) / sr);
    expect(Math.abs(estimatePitch(buf, sr) - 180)).toBeLessThan(6);
    expect(estimatePitch(new Float32Array(2048), sr)).toBe(0);
  });
});
