import { parseSchedule, type ScheduleRow } from "../engine/schedule";
import { intervalDays } from "../engine/tasks";
import { tasks } from "./inbox";
import { assertCan, Invalid } from "./policy";
import { audit, encounters, orgs, patients, type User } from "./repo";

export interface ImportRow extends ScheduleRow {
  match: { kind: "mrn" | "name_dob" | "name" | "new" | "ambiguous"; patientId: string | null; patientName: string | null };
  duplicate: boolean;
  scheduledAt: string | null;
  error: string | null;
}

function at(date: string, time: string | null, fallback: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = time ?? `${String(8 + Math.floor(fallback / 2)).padStart(2, "0")}:${fallback % 2 ? "30" : "00"}`;
  const [h, min] = t.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

export async function previewImport(u: User, text: string, date: string, clinicianId?: string): Promise<ImportRow[]> {
  assertCan(u, "clinical.capture");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Invalid("Choose the clinic date");
  const rows = parseSchedule(text);
  if (!rows.length) throw new Invalid("No appointments found. Paste one appointment per line, or a CSV with a header row.");
  const pats = await patients.list(u);
  const cid = clinicianId ?? u.id;
  const dayStart = new Date(`${date}T00:00:00`);
  const existing = await encounters.list(u, { from: dayStart.toISOString(), to: new Date(dayStart.getTime() + 86400000).toISOString(), clinicianId: cid });
  return rows.map((r, i) => {
    let match: ImportRow["match"];
    const byMrn = r.mrn ? pats.find((p) => p.mrn === r.mrn) : undefined;
    const byNameDob = !byMrn && r.dob ? pats.filter((p) => p.name.toLowerCase() === r.name!.toLowerCase() && p.dob === r.dob) : [];
    const byName = !byMrn && !byNameDob.length ? pats.filter((p) => p.name.toLowerCase() === r.name!.toLowerCase()) : [];
    if (byMrn) match = { kind: "mrn", patientId: byMrn.id, patientName: byMrn.name };
    else if (byNameDob.length === 1) match = { kind: "name_dob", patientId: byNameDob[0].id, patientName: byNameDob[0].name };
    else if (byName.length === 1 && !r.dob) match = { kind: "name", patientId: byName[0].id, patientName: byName[0].name };
    else if (byName.length > 1 && !r.dob) match = { kind: "ambiguous", patientId: null, patientName: null };
    else match = { kind: "new", patientId: null, patientName: null };
    const error = match.kind === "ambiguous" ? `${byName.length} patients are named ${r.name}; add a DOB or MRN` : match.kind === "new" && !r.dob ? "New patient needs a date of birth" : null;
    return { ...r, match, duplicate: !!match.patientId && existing.some((e) => e.patientId === match.patientId), scheduledAt: at(date, r.time, i), error };
  });
}

export async function commitImport(u: User, text: string, date: string, clinicianId?: string) {
  const rows = await previewImport(u, text, date, clinicianId);
  if (clinicianId && clinicianId !== u.id) {
    const m = await orgs.membership(u.orgId, clinicianId);
    if (!m || m.status !== "active" || !["owner", "admin", "clinician"].includes(m.role)) throw new Invalid("Choose a clinician in your organization");
  }
  let created = 0;
  let newPatients = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    if (r.error) { skipped.push(`Line ${r.line}: ${r.error}`); continue; }
    if (r.duplicate) { skipped.push(`Line ${r.line}: ${r.name} already has a visit that day`); continue; }
    let pid = r.match.patientId;
    if (!pid) {
      const p = await patients.create(u, { mrn: r.mrn ?? `IMP${Date.now().toString().slice(-7)}${created}`, name: r.name!, dob: r.dob!, sex: r.sex ?? "X", pronouns: "", language: "en", chart: { problems: r.problems.map((name) => ({ name })), medications: [], allergies: [] } });
      pid = p.id;
      newPatients++;
    }
    await encounters.create(u, { clinicianId: clinicianId ?? u.id, patientId: pid, scheduledAt: r.scheduledAt!, visitType: r.visitType, reason: r.reason.slice(0, 200), templateId: r.visitType === "annual" ? "soap" : undefined, setting: r.visitType === "telehealth" ? "telehealth" : "in-person" });
    created++;
  }
  await audit.log(u, null, "schedule.imported", { date, created, newPatients, skipped: skipped.length });
  return { created, newPatients, skipped };
}

export async function followUpQueue(u: User) {
  const list = await tasks.openOfKind(u, "follow_up", ["owner", "admin", "scribe"].includes(u.role));
  return Promise.all(list.map(async (t) => {
    const enc = t.encounterId ? await encounters.get(u, t.encounterId) : undefined;
    const days = intervalDays(t.title) ?? intervalDays(t.detail) ?? 30;
    const base = enc ? new Date(enc.scheduledAt) : new Date(t.createdAt);
    const target = new Date(base.getTime() + days * 86400000);
    return { ...t, clinicianId: enc?.userId ?? t.assigneeId, clinicianName: enc?.clinicianName ?? null, lastVisit: enc?.scheduledAt ?? null, reason: enc?.reason ?? "", target: target.toISOString().slice(0, 10), intervalDays: days };
  }));
}

export async function bookFollowUp(u: User, taskId: string, when: string) {
  assertCan(u, "clinical.capture");
  const t = await tasks.get(u, taskId);
  if (!t || t.kind !== "follow_up") throw new Error("Follow-up not found");
  if (t.status !== "open") throw new Invalid("This follow-up is already booked or closed");
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) throw new Invalid("Choose a date and time");
  if (d.getTime() < Date.now() - 3600000) throw new Invalid("Choose a time in the future");
  const src = t.encounterId ? await encounters.get(u, t.encounterId) : undefined;
  const enc = await encounters.create(u, { clinicianId: src?.userId ?? t.assigneeId, patientId: t.patientId, scheduledAt: d.toISOString(), visitType: "follow-up", reason: src?.reason ? `Follow-up: ${src.reason}` : "Follow-up visit", templateId: src?.templateId ?? undefined, setting: src?.setting === "telehealth" ? "telehealth" : "in-person" });
  await tasks.setStatus(u, taskId, "done");
  await audit.log(u, enc.id, "schedule.follow_up_booked", { taskId, at: d.toISOString() });
  return enc;
}

export function ics(e: { id: string; scheduledAt: string; reason: string }, org: string, clinician: string, minutes = 20) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(e.scheduledAt);
  const end = new Date(start.getTime() + minutes * 60000);
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Chartside//Scheduling//EN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${e.id}@chartside`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(`Appointment with ${clinician}`)}`, `DESCRIPTION:${esc(e.reason || "Follow-up visit")}`, `LOCATION:${esc(org)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
