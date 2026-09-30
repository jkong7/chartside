import { get, now } from "../db";
import { systemTemplate } from "../engine/templates";
import { buildVetNote, ownerInstructions, ownerText, pickVetTemplate, splitAnimals, type AnimalSegment } from "../engine/vet";
import { generateNoteWithClaude } from "../llm";
import type { Encounter, Note, Patient, Template } from "../types";
import { orgJurisdiction, textOptedOut } from "./jurisdiction";
import { normalizePhone } from "./notify";
import { assertCan, Forbidden, Invalid } from "./policy";
import { recordConsent } from "./pipeline";
import { artifacts, audit, consents, encounters, notes, orgs, patients, templates, utterances, users, type User } from "./repo";
import { sendText } from "./telephony/sms";

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function sameAnimal(p: Patient, seg: AnimalSegment) {
  const a = p.chart.animal;
  if (!a || p.name.toLowerCase() !== seg.name.toLowerCase()) return false;
  if (!same(a.species, seg.profile.species) || same(a.species, "Unknown")) return false;
  if (!same(a.owner, seg.profile.owner) && !same(a.herd, seg.profile.herd)) return false;
  const phone = seg.profile.ownerPhone ? normalizePhone(seg.profile.ownerPhone) : null;
  return !(a.ownerPhone && phone && normalizePhone(a.ownerPhone) !== phone);
}

async function upsertAnimal(u: User, seg: AnimalSegment): Promise<Patient> {
  const existing = (await patients.list(u)).find((p) => sameAnimal(p, seg));
  if (existing) {
    const prior = existing.chart.animal!;
    const fresh = Object.fromEntries(Object.entries({ ...seg.profile, ownerPhone: !prior.ownerPhone && seg.profile.ownerPhone ? normalizePhone(seg.profile.ownerPhone) : null }).filter(([, v]) => v !== null && v !== undefined && v !== "Unknown"));
    const merged = { ...prior, ...fresh, ...(prior.ownerPhone ? { ownerPhone: prior.ownerPhone, ownerPhoneConfirmedAt: prior.ownerPhoneConfirmedAt ?? null } : { ownerPhoneConfirmedAt: null }) };
    if (JSON.stringify(merged) !== JSON.stringify(prior)) await patients.updateChart(u, existing.id, { ...existing.chart, animal: merged });
    return (await patients.get(u, existing.id)) ?? existing;
  }
  const year = seg.profile.ageYears ? new Date().getFullYear() - seg.profile.ageYears : null;
  const created = await patients.create(u, {
    mrn: `A${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
    name: seg.name,
    dob: year ? `${year}-01-01` : "",
    sex: seg.profile.sex === "Female" ? "F" : seg.profile.sex === "Male" ? "M" : "X",
    pronouns: "",
    language: "en",
    chart: { problems: [], medications: [], allergies: [], animal: { ...seg.profile, ownerPhone: seg.profile.ownerPhone ? normalizePhone(seg.profile.ownerPhone) : null, ownerPhoneConfirmedAt: null } },
  });
  await audit.log(u, null, "barn.animal_created", { patientId: created.id, species: seg.profile.species });
  return created;
}

async function templateFor(u: User, id: string): Promise<Template> {
  return (await templates.get(u, id)) ?? systemTemplate(id) ?? systemTemplate("vet_equine")!;
}

async function draftFor(u: User, enc: Encounter, seg: AnimalSegment, patient: Patient, template: Template, opts: { useLlm: boolean; model?: string; warnings: string[] }): Promise<Note> {
  if (opts.useLlm) {
    try {
      return await generateNoteWithClaude({ utterances: seg.utterances, patient, template, reason: enc.reason || `Veterinary visit for ${seg.name}`, visitType: enc.visitType, rules: [], model: opts.model });
    } catch (err) {
      opts.warnings.push(`Claude was unavailable (${err instanceof Error ? err.message : "error"}); used the on-device engine instead.`);
    }
  }
  return buildVetNote(template, seg);
}

export async function processVet(u: User, enc: Encounter, base: Template, opts: { useLlm: boolean; model?: string; warnings: string[]; explicitTemplate: boolean }) {
  const utts = await utterances.list(enc.id);
  const split = splitAnimals(utts);
  const consent = await consents.latest(enc.id);
  const ids: string[] = [];
  let first: Note | null = null;
  const reason = split.animals.length > 1 ? `Farm call: ${split.animals.length} animals${split.animals[0].profile.herd ? ` at ${split.animals[0].profile.herd}` : ""}` : enc.reason;
  for (const [i, seg] of split.animals.entries()) {
    const patient = await upsertAnimal(u, seg);
    const templateId = opts.explicitTemplate ? base.id : pickVetTemplate(seg.utterances.map((x) => x.text).join(" "), base.id);
    const template = templateId === base.id ? base : await templateFor(u, templateId);
    let target = enc;
    if (i > 0) {
      target = await encounters.create(u, { clinicianId: enc.userId, patientId: patient.id, scheduledAt: enc.scheduledAt, visitType: enc.visitType, reason: reason.slice(0, 200), templateId: template.id, setting: enc.setting });
      if (consent?.decision === "granted") await recordConsent(u, target, { decision: "granted", method: consent.method, state: consent.state, othersPresent: consent.othersPresent });
      await artifacts.set(target.id, "capture_origin", { ...((await artifacts.get<Record<string, unknown>>(enc.id, "capture_origin")) ?? {}), splitFrom: enc.id });
      await utterances.replaceAll(target.id, seg.utterances.map((x) => ({ speaker: x.speaker, speakerSource: "manual" as const, text: x.text, tStart: x.tStart, tEnd: x.tEnd, source: x.source ?? "final" })));
      await encounters.update(u, target.id, { startedAt: enc.startedAt, endedAt: enc.endedAt, durationS: enc.durationS });
    } else {
      if (split.animals.length > 1) {
        await artifacts.set(enc.id, "farm_call", { transcript: utts.map((x) => ({ speaker: x.speaker, text: x.text, tStart: x.tStart })) });
        await utterances.replaceAll(enc.id, seg.utterances.map((x) => ({ speaker: x.speaker, speakerSource: "manual" as const, text: x.text, tStart: x.tStart, tEnd: x.tEnd, source: x.source ?? "final" })));
      }
      target = (await encounters.update(u, enc.id, { patientId: patient.id, templateId: template.id, reason: reason.slice(0, 200) }))!;
    }
    const note = await draftFor(u, target, seg, patient, template, opts);
    note.meta.warnings = opts.warnings;
    await notes.create(target.id, note, u.id);
    await artifacts.set(target.id, "facts", { chiefComplaint: null, problems: [], interpreter: null, languages: [] });
    await artifacts.set(target.id, "animal", { name: seg.name, ...seg.profile });
    await encounters.update(u, target.id, { status: "review", endedAt: target.endedAt ?? new Date().toISOString() });
    await audit.log(u, target.id, "note.generated", { engine: note.meta.engine, template: template.id, species: seg.profile.species, farmCall: split.animals.length > 1 ? enc.id : null });
    ids.push(target.id);
    first ??= note;
  }
  if (split.animals.length > 1) {
    await artifacts.set(enc.id, "farm_call", { ...((await artifacts.get<Record<string, unknown>>(enc.id, "farm_call")) ?? {}), encounterIds: ids, animals: split.animals.map((a) => a.name) });
    await audit.log(u, enc.id, "barn.split", { animals: ids.length });
  }
  return { note: first!, warnings: opts.warnings, encounterIds: ids };
}

export async function afterVetSign(u: User, encId: string) {
  const enc = await encounters.get(u, encId);
  if (!enc?.patientId || !enc.templateId?.startsWith("vet_")) return { sent: false as const, reason: "not_vet" };
  if ((await orgJurisdiction(u.orgId)) !== "veterinary") return { sent: false as const, reason: "not_veterinary_org" };
  const org = await orgs.get(u.orgId);
  if (org?.settings.ownerTexts !== true) return { sent: false as const, reason: "off" };
  const patient = await patients.get(u, enc.patientId);
  const phone = normalizePhone(patient?.chart.animal?.ownerPhone ?? "");
  if (!patient || !phone) return { sent: false as const, reason: "no_owner_phone" };
  if (!patient.chart.animal?.ownerPhoneConfirmedAt) {
    await audit.log(u, enc.id, "barn.owner_text_skipped", { reason: "unconfirmed_phone" });
    return { sent: false as const, reason: "unconfirmed_phone" };
  }
  if (await textOptedOut(phone)) {
    await audit.log(u, enc.id, "barn.owner_text_skipped", { reason: "opted_out" });
    return { sent: false as const, reason: "opted_out" };
  }
  const already = await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE encounter_id = ? AND action = 'barn.owner_texted'", enc.id);
  if (Number(already?.n ?? 0) > 0) return { sent: false as const, reason: "already_sent" };
  const rec = await notes.latest(enc.id);
  const clinician = await users.byId(enc.userId);
  const body = rec ? ownerText({ animal: patient.name, vet: clinician?.name ?? "your vet", lines: ownerInstructions(rec.content) }) : null;
  if (!body) return { sent: false as const, reason: "no_instructions" };
  try {
    await sendText(phone, body, "owner_instructions", { content: true });
    await audit.log(u, enc.id, "barn.owner_texted", { lines: body.split("\n").length });
    return { sent: true as const };
  } catch (err) {
    await audit.log(u, enc.id, "barn.owner_text_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
    return { sent: false as const, reason: "failed" };
  }
}

export async function setOwnerPhone(u: User, patientId: string, input: { phone?: string | null; confirm?: boolean }) {
  assertCan(u, "patients.write");
  const p = await patients.get(u, patientId);
  if (!p?.chart.animal) throw new Invalid("This isn't an animal's record");
  const raw = (input.phone ?? "").trim();
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) throw new Invalid("Enter a 10 digit phone number");
  const prior = p.chart.animal.ownerPhone ?? null;
  if (input.confirm && !phone) throw new Invalid("Add the owner's phone number first");
  const animal = { ...p.chart.animal, ownerPhone: phone, ownerPhoneConfirmedAt: phone ? now() : null };
  await patients.updateChart(u, p.id, { ...p.chart, animal });
  await audit.log(u, null, "barn.owner_phone", { patientId: p.id, changed: prior !== phone, removed: !phone, confirmed: !!phone, last4: phone ? phone.slice(-4) : null });
  return animal;
}

export async function setOwnerTexts(u: User, on: boolean) {
  if (u.role !== "owner") throw new Forbidden("Only the practice owner can change this");
  const org = await orgs.get(u.orgId);
  if (!org) throw new Invalid("Practice not found");
  const from = org.settings.ownerTexts === true;
  await orgs.update(u.orgId, { settings: { ...org.settings, ownerTexts: on } });
  await audit.log(u, null, "org.owner_texts", { from, to: on });
  return on;
}
