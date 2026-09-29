import { encounters, patients, type User } from "../repo";

export function clinicTz() {
  return process.env.CHARTSIDE_TZ || "America/Chicago";
}

export function spokenTime(iso: string, tz = clinicTz()) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
    .format(new Date(iso))
    .replace(/:00 /, " ")
    .replace(/ ?(AM|PM)$/, "");
}

const VISIT_WORDS: Record<string, string> = { new: "a new patient visit", "follow-up": "a follow-up", acute: "an acute visit", annual: "an annual exam", telehealth: "a telehealth visit" };

export async function nextVisitFor(u: User, now = new Date()) {
  const from = new Date(now.getTime() - 90 * 60_000).toISOString();
  const to = new Date(now.getTime() + 90 * 60_000).toISOString();
  const list = (await encounters.list(u, { from, to, clinicianId: u.id, statuses: ["scheduled"], outpatient: true })).filter((e) => e.patientId);
  if (!list.length) return null;
  const best = list.sort((a, b) => Math.abs(Date.parse(a.scheduledAt) - now.getTime()) - Math.abs(Date.parse(b.scheduledAt) - now.getTime()))[0];
  const p = await patients.get(u, best.patientId!);
  if (!p) return null;
  const kind = VISIT_WORDS[best.visitType] ?? "a visit";
  const reason = best.reason ? ` for ${best.reason.replace(/\.$/, "").toLowerCase()}` : "";
  return { encounterId: best.id, spoken: `Your ${spokenTime(best.scheduledAt)} is ${p.name}, ${kind}${reason}.` };
}
