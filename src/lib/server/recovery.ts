import { all } from "../db";
import { clockTime, tzOf } from "../tz";
import { recordingMinutesFromEnv } from "../engine/limits";
import { finishCaptureFor } from "./capture";
import { mintLoginLink } from "./magic";
import { actorFor, artifacts, audit } from "./repo";
import { sendText } from "./telephony/sms";
import { liveCallsFor } from "./telephony/live";

export const IDLE_MINUTES = 10;

const PHONE = new Set(["phone", "phone-sim"]);

export async function recoverStalledCaptures(at = new Date(), idleMinutes = IDLE_MINUTES) {
  const cutoff = new Date(at.getTime() - idleMinutes * 60_000).toISOString();
  const browserCutoff = new Date(at.getTime() - (recordingMinutesFromEnv() + 30) * 60_000).toISOString();
  const rows = await all<{ id: string; user_id: string; org_id: string; last: string; origin: string }>(
    `SELECT e.id, e.user_id, e.org_id, MAX(c.created_at) AS last, a.content AS origin
     FROM encounters e
     JOIN artifacts a ON a.encounter_id = e.id AND a.kind = 'capture_origin'
     JOIN audio_chunks c ON c.encounter_id = e.id
     WHERE e.status IN ('recording', 'paused')
     GROUP BY e.id, e.user_id, e.org_id, a.content
     HAVING MAX(c.created_at) < ?`,
    cutoff,
  );
  const recovered: string[] = [];
  for (const r of rows) {
    let origin: { channel?: string; error?: string; recoveredAt?: string } = {};
    try {
      origin = JSON.parse(r.origin);
    } catch {
      continue;
    }
    if (origin.error || origin.recoveredAt) continue;
    if (!PHONE.has(origin.channel ?? "") && r.last >= browserCutoff) continue;
    if (liveCallsFor(r.user_id).some((c) => c.encounterId === r.id)) continue;
    const actor = await actorFor(r.user_id, r.org_id);
    if (!actor) continue;
    try {
      await artifacts.set(r.id, "capture_origin", { ...origin, recoveredAt: at.toISOString() });
      await finishCaptureFor(actor, r.id, {});
      await audit.log(actor, r.id, "capture.recovered", { lastAudioAt: r.last });
      recovered.push(r.id);
      const call = await artifacts.get<{ phone?: string; startedAt?: string }>(r.id, "phone_call");
      if (call?.phone && !actor.prefs.textOptOut) {
        const when = call.startedAt ? clockTime(call.startedAt, tzOf(actor)) : "earlier";
        const { url } = await mintLoginLink(actor.id, `/go/stack?focus=${encodeURIComponent(r.id)}`, 60, { verifiesPhone: actor.guestUntil ? call.phone : null });
        await sendText(call.phone, `Chartside: your ${when} call dropped before it ended. The note is being written from what was recorded: ${url}`, "call_recovered").catch(() => {});
      }
    } catch (err) {
      await audit.log(actor, r.id, "capture.recover_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "error" });
    }
  }
  return recovered;
}
