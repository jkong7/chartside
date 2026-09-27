import { assertCan } from "@/lib/server/policy";
import { guessSpeaker } from "@/lib/engine/extract";
import { detectLang } from "@/lib/engine/lang";
import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, utterances } from "@/lib/server/repo";
import type { Speaker, VoiceFeatures } from "@/lib/types";

interface In {
  text: string;
  speaker?: Speaker | "auto";
  tStart?: number;
  tEnd?: number;
  lang?: string;
  voice?: VoiceFeatures;
  confidence?: number;
  speakerLabel?: string;
}

function cleanVoice(v?: VoiceFeatures): VoiceFeatures | null {
  if (!v || [v.pitch, v.centroid, v.energy, v.frames].some((x) => typeof x !== "number" || !Number.isFinite(x))) return null;
  return { pitch: v.pitch, centroid: v.centroid, energy: v.energy, frames: Math.round(v.frames) };
}

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.capture");
  if (enc.status !== "recording" && enc.status !== "paused") return fail("Capture is not active for this visit", 409);
  const b = await body<{ utterances?: In[] }>(req);
  const items = (b.utterances ?? []).filter((u) => u.text?.trim());
  if (!items.length) return fail("No utterances");
  let prev = ((await utterances.list(enc.id)).at(-1)?.speaker ?? null) as "clinician" | "patient" | null;
  const rows = items.map((u) => {
    const auto = !u.speaker || u.speaker === "auto";
    const speaker: Speaker = auto ? guessSpeaker(u.text, prev === "clinician" || prev === "patient" ? prev : null) : (u.speaker as Speaker);
    prev = speaker === "other" ? prev : speaker;
    const detected = detectLang(u.text);
    const lang = u.lang?.slice(0, 2) || (detected === "und" ? enc.inputLang : detected);
    return {
      speaker,
      speakerSource: auto ? ("auto" as const) : ("manual" as const),
      text: u.text.trim().slice(0, 2000),
      tStart: u.tStart ?? 0,
      tEnd: u.tEnd ?? u.tStart ?? 0,
      lang,
      voice: cleanVoice(u.voice),
      confidence: typeof u.confidence === "number" ? u.confidence : null,
      source: "live" as const,
    };
  });
  const saved = await utterances.append(enc.id, rows);
  const last = saved.at(-1);
  if (last && last.tEnd > enc.durationS) await encounters.update(user, enc.id, { durationS: Math.round(last.tEnd) });
  return json({ utterances: saved }, 201);
});
