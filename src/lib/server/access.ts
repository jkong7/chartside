import { all, get } from "../db";
import { Forbidden, Invalid } from "./policy";
import { audit, encounters, j, notes, orgs, patients, type User } from "./repo";
import type { Encounter } from "../types";

export class BreakGlassRequired extends Error {
  constructor() {
    super("This is a restricted behavioral health note. State your reason to open it.");
    this.name = "BreakGlass";
  }
}

export const BREAK_GLASS_REASONS = ["Treating the patient now", "Emergency", "Coding or billing review", "Quality or compliance review", "Patient request for records", "Other"] as const;
const WINDOW_MS = 4 * 3600 * 1000;
const VIEW_DEDUPE_MS = 30 * 60 * 1000;

async function recent(u: User, encId: string, action: string, ms: number) {
  const since = new Date(Date.now() - ms).toISOString();
  return !!(await get<{ id: string }>("SELECT id FROM audit WHERE encounter_id = ? AND user_id = ? AND action = ? AND created_at >= ? LIMIT 1", encId, u.id, action, since));
}

export async function careTeam(u: User, enc: Pick<Encounter, "id" | "userId">) {
  if (enc.userId === u.id) return true;
  const m = await orgs.membership(u.orgId, enc.userId);
  if (m?.supervisor_id === u.id) return true;
  return !!(await get<{ id: string }>("SELECT id FROM encounter_shares WHERE encounter_id = ? AND kind = 'member' AND user_id = ? AND revoked_at IS NULL", enc.id, u.id));
}

export async function needsBreakGlass(u: User, enc: Pick<Encounter, "id" | "userId">) {
  const note = await notes.latest(enc.id);
  if (!note?.content.meta.sensitive) return false;
  if (await careTeam(u, enc)) return false;
  return !(await recent(u, enc.id, "note.break_glass", WINDOW_MS));
}

export async function assertNoteAccess(u: User, enc: Pick<Encounter, "id" | "userId">) {
  if (await needsBreakGlass(u, enc)) throw new BreakGlassRequired();
}

export async function breakGlass(u: User, encId: string, input: { reason?: string; detail?: string }) {
  const enc = await encounters.get(u, encId);
  if (!enc) throw new Error("Encounter not found");
  if (!(BREAK_GLASS_REASONS as readonly string[]).includes(input.reason ?? "")) throw new Invalid("Choose a reason");
  const detail = (input.detail ?? "").trim();
  if (input.reason === "Other" && detail.length < 10) throw new Invalid("Describe why you need this note");
  await audit.log(u, encId, "note.break_glass", { reason: input.reason, detail: detail.slice(0, 300) });
}

export async function logView(u: User, encId: string) {
  if (await recent(u, encId, "encounter.viewed", VIEW_DEDUPE_MS)) return;
  await audit.log(u, encId, "encounter.viewed", {});
}

const LABEL: Record<string, string> = {
  "encounter.viewed": "Viewed the visit",
  "note.break_glass": "Opened a restricted note (break the glass)",
  "export.text": "Exported the note as text",
  "export.fhir": "Exported the note as FHIR",
  "note.signed": "Signed the note",
  "share.created": "Shared the visit",
  "share.viewed": "Viewed a shared copy",
  "share.revoked": "Revoked a share",
  "summary.shared": "Sent the patient summary",
  "ehr.filed": "Filed to the EHR",
};

export async function accessReport(u: User, patientId: string, days = 365) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only admins can run access reports");
  const p = await patients.get(u, patientId);
  if (!p) throw new Error("Patient not found");
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await all<{ action: string; detail: string; created_at: string; user_name: string | null; encounter_id: string; scheduled_at: string }>(
    `SELECT a.action, a.detail, a.created_at, us.name AS user_name, a.encounter_id, e.scheduled_at FROM audit a JOIN encounters e ON e.id = a.encounter_id LEFT JOIN users us ON us.id = a.user_id WHERE e.patient_id = ? AND e.org_id = ? AND a.created_at >= ? AND a.action IN (${Object.keys(LABEL).map(() => "?").join(", ")}) ORDER BY a.created_at DESC`,
    p.id, u.orgId, since, ...Object.keys(LABEL),
  );
  const events = rows.map((r) => {
    const d = j<Record<string, unknown>>(r.detail, {});
    const who = r.user_name ?? (d.external ? "External recipient" : "System");
    const extra = r.action === "note.break_glass" ? `Reason: ${d.reason}${d.detail ? ` (${d.detail})` : ""}` : r.action === "share.created" ? (d.kind === "external" ? `Disclosed outside the organization to ${d.email}` : `Shared with a colleague (${d.access})`) : r.action === "share.viewed" && d.external ? "External view after code verification" : "";
    return { at: r.created_at, who, action: LABEL[r.action] ?? r.action, detail: extra, encounterId: r.encounter_id, visitDate: r.scheduled_at, disclosure: r.action === "share.created" && d.kind === "external" };
  });
  const byUser = new Map<string, number>();
  for (const e of events) byUser.set(e.who, (byUser.get(e.who) ?? 0) + 1);
  return { patient: { id: p.id, name: p.name, mrn: p.mrn }, days, events, disclosures: events.filter((e) => e.disclosure), breakGlass: events.filter((e) => e.action.startsWith("Opened a restricted")).length, users: [...byUser.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
}

export function reportCsv(r: Awaited<ReturnType<typeof accessReport>>) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ["When,Who,Action,Detail,Visit date", ...r.events.map((e) => [e.at, e.who, e.action, e.detail, e.visitDate.slice(0, 10)].map(q).join(","))].join("\n");
}
