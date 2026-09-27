import { guessSpeaker } from "@/lib/engine/extract";
import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, utterances } from "@/lib/server/repo";
import type { Speaker } from "@/lib/types";

interface In {
  text: string;
  speaker?: Speaker | "auto";
  tStart?: number;
  tEnd?: number;
  lang?: string;
}

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status !== "recording" && enc.status !== "paused") return fail("Capture is not active for this visit", 409);
  const b = await body<{ utterances?: In[] }>(req);
  const items = (b.utterances ?? []).filter((u) => u.text?.trim());
  if (!items.length) return fail("No utterances");
  let prev = (utterances.list(enc.id).at(-1)?.speaker ?? null) as "clinician" | "patient" | null;
  const rows = items.map((u) => {
    const auto = !u.speaker || u.speaker === "auto";
    const speaker: Speaker = auto ? guessSpeaker(u.text, prev === "clinician" || prev === "patient" ? prev : null) : (u.speaker as Speaker);
    prev = speaker === "other" ? prev : speaker;
    return { speaker, speakerSource: auto ? ("auto" as const) : ("manual" as const), text: u.text.trim().slice(0, 2000), tStart: u.tStart ?? 0, tEnd: u.tEnd ?? u.tStart ?? 0, lang: u.lang ?? enc.inputLang };
  });
  const saved = utterances.append(enc.id, rows);
  const last = saved.at(-1);
  if (last && last.tEnd > enc.durationS) encounters.update(user.id, enc.id, { durationS: Math.round(last.tEnd) });
  return json({ utterances: saved }, 201);
});
