import { all, get, now, run, uid } from "../db";
import { ccmEligible, draftCarePlan, monthCodes, chronicProblems, type CarePlanItem } from "../engine/ccm";
import { Forbidden, Invalid } from "./policy";
import { audit, j, orgs, patients, users, type User } from "./repo";

interface Row {
  id: string;
  patient_id: string;
  billing_clinician_id: string;
  consent_at: string;
  consent_method: string;
  care_plan: string;
  status: string;
  created_at: string;
}

const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function assertCareTeam(u: User) {
  if (!["owner", "admin", "clinician", "nurse"].includes(u.role)) throw new Forbidden("Only clinicians and clinical staff can work care management");
}

export async function ccmWorklist(u: User, month = monthOf()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Invalid("Month must look like 2026-09");
  const rows = await all<Row>("SELECT * FROM ccm_enrollments WHERE org_id = ? AND status = 'active' ORDER BY created_at", u.orgId);
  const pats = await patients.list(u);
  const byId = new Map(pats.map((p) => [p.id, p]));
  const enrolled = [];
  for (const r of rows) {
    const p = byId.get(r.patient_id);
    if (!p) continue;
    const logs = await all<{ id: string; minutes: number; role: string; activity: string; note: string; at: string; user_name: string }>("SELECT t.id, t.minutes, t.role, t.activity, t.note, t.at, us.name AS user_name FROM ccm_time t JOIN users us ON us.id = t.user_id WHERE t.enrollment_id = ? AND t.month = ? ORDER BY t.at DESC", r.id, month);
    const totals = monthCodes(logs.map((l) => ({ minutes: Number(l.minutes), role: l.role as "staff" | "physician" })));
    enrolled.push({ id: r.id, patientId: p.id, name: p.name, mrn: p.mrn, consentAt: r.consent_at, consentMethod: r.consent_method, carePlan: j<CarePlanItem[]>(r.care_plan, []), billingClinicianId: r.billing_clinician_id, logs: logs.map((l) => ({ ...l, minutes: Number(l.minutes) })), totals });
  }
  const eligible = pats.filter((p) => !rows.some((r) => r.patient_id === p.id)).map((p) => ({ patientId: p.id, name: p.name, mrn: p.mrn, ...ccmEligible(p.chart) })).filter((x) => x.eligible);
  return { month, enrolled, eligible };
}

export async function enroll(u: User, input: { patientId?: string; consentMethod?: string; billingClinicianId?: string }) {
  assertCareTeam(u);
  const p = input.patientId ? await patients.get(u, input.patientId) : undefined;
  if (!p) throw new Invalid("Choose a patient");
  const el = ccmEligible(p.chart);
  if (!el.eligible) throw new Invalid("Chronic care management needs two or more chronic conditions expected to last at least 12 months");
  if (!["verbal", "written"].includes(input.consentMethod ?? "")) throw new Invalid("Record how the patient consented (verbal or written), including that cost sharing may apply");
  if (await get<{ id: string }>("SELECT id FROM ccm_enrollments WHERE org_id = ? AND patient_id = ? AND status = 'active'", u.orgId, p.id)) throw new Invalid(`${p.name} is already enrolled`);
  const billing = input.billingClinicianId ?? (["owner", "admin", "clinician"].includes(u.role) ? u.id : undefined);
  const m = billing ? await orgs.membership(u.orgId, billing) : undefined;
  if (!billing || !m || !["owner", "admin", "clinician"].includes(m.role)) throw new Invalid("Choose the billing practitioner");
  const id = uid("ccm_");
  await run("INSERT INTO ccm_enrollments (id, org_id, patient_id, billing_clinician_id, consent_at, consent_method, care_plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)", id, u.orgId, p.id, billing, now(), input.consentMethod!, JSON.stringify(draftCarePlan(p.chart)), now());
  await audit.log(u, null, "ccm.enrolled", { id, patientId: p.id, consent: input.consentMethod });
  return id;
}

async function enrollment(u: User, id: string) {
  const r = await get<Row>("SELECT * FROM ccm_enrollments WHERE org_id = ? AND id = ?", u.orgId, id);
  if (!r) throw new Error("Enrollment not found");
  return r;
}

export async function logTime(u: User, id: string, input: { minutes?: number; activity?: string; note?: string; at?: string }) {
  assertCareTeam(u);
  const r = await enrollment(u, id);
  if (r.status !== "active") throw new Invalid("This patient is no longer enrolled");
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) throw new Invalid("Minutes must be between 1 and 120");
  const activity = (input.activity ?? "").trim();
  if (!activity) throw new Invalid("Describe the activity");
  const at = input.at ? new Date(input.at) : new Date();
  if (at.toISOString() < r.consent_at) throw new Invalid("Time before consent can't be counted");
  const role = u.role === "nurse" ? "staff" : "physician";
  await run("INSERT INTO ccm_time (id, org_id, enrollment_id, user_id, role, minutes, activity, note, month, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("ccmt_"), u.orgId, id, u.id, role, minutes, activity.slice(0, 80), (input.note ?? "").slice(0, 500), monthOf(at), at.toISOString());
  await audit.log(u, null, "ccm.time_logged", { id, minutes, role });
}

export async function updateCarePlan(u: User, id: string, plan: CarePlanItem[]) {
  assertCareTeam(u);
  await enrollment(u, id);
  const clean = plan.filter((p) => p.problem?.trim() && p.goal?.trim()).slice(0, 20).map((p) => ({ problem: p.problem.trim().slice(0, 120), icd10: p.icd10 ?? null, goal: p.goal.trim().slice(0, 200), interventions: (p.interventions ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8) }));
  if (!clean.length) throw new Invalid("The care plan needs at least one problem with a goal");
  await run("UPDATE ccm_enrollments SET care_plan = ? WHERE id = ?", JSON.stringify(clean), id);
  await audit.log(u, null, "ccm.care_plan_updated", { id });
}

export async function unenroll(u: User, id: string) {
  assertCareTeam(u);
  await enrollment(u, id);
  await run("UPDATE ccm_enrollments SET status = 'ended' WHERE id = ?", id);
  await audit.log(u, null, "ccm.ended", { id });
}

export async function monthExport(u: User, month: string) {
  if (!["owner", "admin", "clinician", "coder"].includes(u.role)) throw new Forbidden("Your role can't export billing");
  const wl = await ccmWorklist(u, month);
  const npi = ((await orgs.get(u.orgId))?.settings.billing as { npi?: string } | undefined)?.npi ?? "";
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Month", "Patient", "MRN", "DOB", "Billing practitioner", "NPI", "Codes", "Staff minutes", "Practitioner minutes", "Diagnoses", "Consent"].join(",")];
  for (const e of wl.enrolled.filter((x) => x.totals.codes.length)) {
    const p = (await patients.get(u, e.patientId))!;
    const clin = await users.byId(e.billingClinicianId);
    const dx = chronicProblems(p.chart).map((x) => x.icd10).filter(Boolean).slice(0, 4).join(" ");
    rows.push([month, p.name, p.mrn, p.dob, clin?.name ?? "", npi, e.totals.codes.map((c) => `${c.cpt}x${c.units}`).join(" "), e.totals.staffMinutes, e.totals.physicianMinutes, dx, `${e.consentMethod} ${e.consentAt.slice(0, 10)}`].map((v) => q(String(v))).join(","));
  }
  await audit.log(u, null, "ccm.exported", { month, rows: rows.length - 1 });
  return rows.join("\n");
}
