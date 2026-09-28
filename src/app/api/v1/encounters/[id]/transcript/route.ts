import { apiHandler } from "@/lib/server/platform";
import { recordConsent } from "@/lib/server/pipeline";
import { Invalid } from "@/lib/server/policy";
import { audit, consents, encounters, utterances } from "@/lib/server/repo";

export const POST = apiHandler<{ id: string }>("encounters:write", async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Invalid("This encounter is signed");
  const b = (await req.json().catch(() => ({}))) as { consent?: { obtained?: boolean; method?: "verbal" | "written" | "patient-device"; state?: string; othersPresent?: boolean }; utterances?: { speaker?: string; text?: string; start?: number; end?: number }[] };
  if (!(await consents.latest(enc.id))) {
    if (!b.consent?.obtained || !b.consent.state || !/^[A-Z]{2}$/.test(b.consent.state)) throw new Invalid("Record consent: send consent.obtained = true with the method and two-letter state where the visit took place");
    await recordConsent(user, enc, { decision: "granted", method: b.consent.method ?? "verbal", state: b.consent.state, othersPresent: !!b.consent.othersPresent });
  }
  const items = (b.utterances ?? []).filter((u) => u.text?.trim()).slice(0, 2000);
  if (!items.length) throw new Invalid("Send at least one utterance with speaker and text");
  const saved = await utterances.append(enc.id, items.map((u, i) => ({ speaker: (["clinician", "patient", "other"].includes(u.speaker ?? "") ? u.speaker : "other") as "clinician", speakerSource: "manual" as const, text: u.text!.trim().slice(0, 4000), tStart: u.start ?? i * 5, tEnd: u.end ?? i * 5 + 4, source: "typed" as const })));
  if (enc.status === "scheduled") await encounters.update(user, enc.id, { status: "paused", startedAt: new Date().toISOString() });
  await audit.log(user, enc.id, "api.transcript", { lines: saved.length });
  return { data: { appended: saved.length } };
});
