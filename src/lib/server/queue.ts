import { signEncounter } from "./pipeline";
import { encounters, notes, patients, type User } from "./repo";

export async function unsignedQueue(u: User) {
  const list = (await encounters.list(u, { statuses: ["review"], clinicianId: u.id })).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return Promise.all(list.map(async (e) => {
    const p = e.patientId ? await patients.get(u, e.patientId) : undefined;
    const rec = await notes.latest(e.id);
    let blockers: string[] = [];
    try {
      blockers = (await signEncounter(u, e.id, { dryRun: true })).blockers;
    } catch (err) {
      blockers = [err instanceof Error ? err.message : "Can't be signed yet"];
    }
    const ageHours = Math.round((Date.now() - new Date(e.endedAt ?? e.scheduledAt).getTime()) / 3600000);
    return { id: e.id, patient: p?.name ?? "No patient", reason: e.reason, scheduledAt: e.scheduledAt, ageHours, words: rec ? rec.content.sections.flatMap((s) => s.sentences).reduce((n, s) => n + s.text.split(/\s+/).length, 0) : 0, blockers };
  }));
}

export async function signClean(u: User, ids: string[]) {
  const out: { id: string; signed: boolean; blockers: string[] }[] = [];
  for (const id of ids.slice(0, 50)) {
    const r = await signEncounter(u, id);
    out.push({ id, signed: r.signed, blockers: r.blockers });
  }
  return out;
}
