import { createHash } from "node:crypto";
import { assistWithClaude, generateNoteWithClaude, llmEnabled, llmModel, translateSummaryWithClaude } from "../llm";
import { localAssist } from "../engine/assist";
import { computeCoding, type CodingContext } from "../engine/coding";
import { psychotherapyMinutes } from "../engine/behavioral";
import { extractOncology, needsToxicityMonitoring, updateProfile } from "../engine/oncology";
import { computeCoverage } from "../engine/coverage";
import { extractFacts, type Facts } from "../engine/extract";
import { buildReferralLetters } from "../engine/letter";
import { ALL_PARTY_STATES, DISCLOSURE_STATES, STATE_NAMES } from "../engine/lexicon";
import { buildNote, therapyDiscipline, therapyEvaluation } from "../engine/note";
import { extractTherapy } from "../engine/therapy";
import { extractProcedures } from "../engine/procedures";
import { extractPrenatal, prenatalCodes } from "../engine/prenatal";
import { wellChild } from "../engine/wellchild";
import { awvReview } from "../engine/awv";
import { ageInMonths } from "../engine/immunizations";
import { stageOrders } from "../engine/orders";
import { applyStyle, learnFromEdits } from "../engine/style";
import { buildPatientSummary } from "../engine/summary";
import { systemTemplate } from "../engine/templates";
import { ageFrom } from "../engine/text";
import { detectOmissions, scoreSupport, supportStats } from "../engine/verify";
import type { CodingResult, ConsentRecord, Encounter, Note, OmissionFlag, Patient, PatientSummary } from "../types";
import { icdReleaseFor } from "../codesets";
import { deleteAudio, finalPass, localDiarize, purgeExpired, retentionDays } from "./audio";
import { checkInterpretation } from "../engine/interpreter";
import { buildClaim, claimStatus } from "../engine/billing";
import { buildPriorAuths } from "../engine/priorauth";
import { enrichCoding, hccMapper, payerFor, referenceFor } from "./rcm";
import { canSign, Forbidden, Invalid } from "./policy";
import { assertNotGuest } from "./guest";
import { syncTasks } from "./inbox";
import { applyReplacements, vocabulary } from "./snippets";
import { cosignPlan, documentText, holdClaimForCosign, recordSignature } from "./signoff";
import { addenda, artifacts, audioChunks, audit, claims, consents, encounters, notes, orders, patients, styleRules, templates, utterances, users, type User } from "./repo";

export const CONSENT_SCRIPT_VERSION = "2026.09-a";

export function consentScript(clinician: string, stateCode: string) {
  const allParty = ALL_PARTY_STATES.has(stateCode);
  return {
    allParty,
    stateName: STATE_NAMES[stateCode] ?? stateCode,
    disclosure: DISCLOSURE_STATES[stateCode] ?? null,
    script: `${clinician} uses Chartside, an AI tool that listens to our conversation and drafts my visit note so I can focus on you. The audio is transcribed and not stored after your note is created; the transcript is kept with your record and only your care team can see it. You can say no or ask me to pause at any time, and your care will not change. Is it okay if I use it today?`,
  };
}

export async function recordConsent(user: User, enc: Encounter, input: { decision: "granted" | "declined"; method: ConsentRecord["method"]; state: string; othersPresent: boolean }) {
  const { allParty, stateName } = consentScript(user.name, input.state);
  const when = new Date().toISOString();
  const statement =
    input.decision === "granted"
      ? `${input.method === "verbal" ? "Verbal" : input.method === "written" ? "Written" : "Patient-device"} consent for AI-assisted documentation was obtained by ${user.name} at ${when} using consent script ${CONSENT_SCRIPT_VERSION}. ${enc.setting === "telehealth" ? "Telehealth visit; patient located in" : "Visit location:"} ${stateName}${allParty ? " (all-party consent state" + (input.othersPresent ? "; all parties present consented" : "") + ")" : ""}.`
      : `Patient declined AI-assisted documentation at ${when}. No audio was captured; documentation will be completed manually.`;
  const digest = createHash("sha256").update(JSON.stringify({ enc: enc.id, user: user.id, ...input, statement, script: CONSENT_SCRIPT_VERSION })).digest("hex");
  const rec = await consents.add({ encounterId: enc.id, userId: user.id, decision: input.decision, method: input.method, state: input.state, allParty, othersPresent: input.othersPresent, scriptVersion: CONSENT_SCRIPT_VERSION, statement, digest });
  await audit.log(user, enc.id, input.decision === "granted" ? "consent.granted" : "consent.declined", { method: input.method, state: input.state, digest });
  return rec;
}

async function templateFor(user: User, enc: Encounter) {
  return (await templates.get(user, enc.templateId ?? (enc.visitType === "ed" || enc.setting === "ed" ? "ed_note" : user.prefs.defaultTemplate ?? "soap"))) ?? systemTemplate("soap")!;
}

export async function clinicianOf(enc: Encounter) {
  return (await users.byId(enc.userId)) ?? { name: "Clinician", specialty: "", id: enc.userId };
}

export async function factsFor(user: User, enc: Encounter): Promise<{ facts: Facts; patient: Patient | null }> {
  const patient = enc.patientId ? (await patients.get(user, enc.patientId)) ?? null : null;
  const utts = await utterances.list(enc.id);
  return { facts: extractFacts(utts, patient?.chart, { pronouns: patient?.pronouns, sex: patient?.sex }), patient };
}

export async function liveCoverage(user: User, enc: Encounter) {
  const { facts, patient } = await factsFor(user, enc);
  const template = await templateFor(user, enc);
  const utts = await utterances.list(enc.id);
  const draft = utts.length >= 2 ? buildNote(facts, { patient, encounter: enc, template, utterances: utts, minutes: Math.round((utts.at(-1)?.tEnd ?? 0) / 60), startedAt: enc.startedAt }).sections.filter((s) => /^(?:hpi|subjective|interval|history|assessment_plan|ap|assessment|plan)$/.test(s.key) || /history|assessment|plan|subjective/i.test(s.title)).map((s) => ({ title: s.title, lines: s.sentences.filter((x) => !x.pending && x.kind !== "default").map((x) => x.text).slice(0, 8) })).filter((s) => s.lines.length) : [];
  return {
    draft,
    coverage: computeCoverage(facts, { visitType: enc.visitType }),
    snapshot: {
      chiefComplaint: facts.chiefComplaint?.label ?? null,
      problems: facts.problems.map((p) => ({ label: p.label, icd10: p.icd10, status: p.status ?? null })),
      meds: facts.meds.filter((m) => !m.cancelled && ["start", "stop", "increase", "decrease", "change", "refill"].includes(m.action)).map((m) => `${m.action} ${m.name}${m.dose ? " " + m.dose : ""}`),
      orders: facts.orders.map((o) => o.name),
      allergies: facts.allergies.map((a) => a.substance),
    },
  };
}

export interface ProcessResult {
  note: Note;
  warnings: string[];
}

export async function processEncounter(user: User, encId: string, opts: { templateId?: string; engine?: "local" | "auto"; detail?: "concise" | "standard" | "detailed"; model?: string } = {}): Promise<ProcessResult> {
  let enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  if (opts.templateId && opts.templateId !== enc.templateId) enc = (await encounters.update(user, encId, { templateId: opts.templateId }))!;
  const base = await templateFor(user, enc);
  const author = enc.userId === user.id ? user : await users.byId(enc.userId);
  const detail = opts.detail ?? author?.prefs.noteDetail ?? base.style.verbosity ?? "standard";
  const template = { ...base, style: { ...base.style, verbosity: detail } };
  const clinician = await clinicianOf(enc);
  const warnings: string[] = [];
  const started = Date.now();
  let finalPassFailed = false;
  if (opts.engine !== "local" && user.prefs.finalPass !== false && !(await utterances.list(enc.id)).some((u) => u.source === "final")) {
    try {
      await finalPass(user, enc);
    } catch (err) {
      finalPassFailed = true;
      warnings.push(`High-accuracy re-transcription was unavailable (${err instanceof Error ? err.message : "error"}); the live transcript was used.`);
    }
  }
  await localDiarize(user, enc);
  const utts = await utterances.list(enc.id);
  if (!utts.length) throw new Error(finalPassFailed ? "Speech transcription is unavailable right now. The audio is saved; draft the note again shortly." : "Audio was recorded but no transcript is available. Add DEEPGRAM_API_KEY for server-side transcription, or type the conversation.");
  const { facts, patient } = await factsFor(user, enc);
  const rules = await styleRules.list(enc.userId);
  const interpretation = checkInterpretation(utts);

  let note: Note | null = null;
  const useLlm = llmEnabled() && opts.engine !== "local";
  if (useLlm && utts.length) {
    try {
      note = await generateNoteWithClaude({ utterances: utts, patient, template, reason: enc.reason, visitType: enc.visitType, rules, model: opts.model });
    } catch (err) {
      warnings.push("The usual note writer was busy, so the backup writer drafted this note. Read it closely before you sign.");
      console.error("claude note failed", opts.model || llmModel(), err instanceof Error ? err.message : err);
    }
  }
  const sessionMinutes = Math.round((enc.durationS || (utts.at(-1)?.tEnd ?? 0)) / 60);
  if (!note) note = buildNote(facts, { patient, encounter: enc, template, utterances: utts, minutes: sessionMinutes, startedAt: enc.startedAt });
  else {
    const special = template.sections.filter((ts) => ["risk", "interventions", "response", "therapy_time", "ed_course", "disposition", "goals", "group_topic", "group_participation", "therapy_services", "therapy_measures", "therapy_eval", "procedure_note", "ob_summary", "ob_warning", "ob_exam", "ob_due", "gdmt", "well_screens", "guidance", "imm_due", "awv", "screening_schedule", "acp", "msk_exam", "skin_exam", "onc_history", "onc_treatment", "toxicity"].includes(ts.kind));
    if (special.length) {
      const { buildSection } = await import("../engine/note");
      const ctx = { patient, encounter: enc, template, utterances: utts, minutes: sessionMinutes, startedAt: enc.startedAt };
      note = { ...note, sections: template.sections.map((ts) => (special.includes(ts) ? buildSection(ts, facts, ctx) : note!.sections.find((x) => x.key === ts.key) ?? buildSection(ts, facts, ctx))), meta: { ...note.meta, sensitive: /^(?:bh_|behavioral|psych_)/.test(template.id) || undefined } };
    }
  }
  if (enc.admissionId) {
    const { inpatientNote } = await import("./inpatient");
    note = await inpatientNote(user, enc, facts, patient, note);
  }
  const procs = extractProcedures(utts);
  if (procs.procedures.length && !template.sections.some((s) => s.kind === "procedure_note")) {
    const { buildSection } = await import("../engine/note");
    const sec = buildSection({ key: "procedure", title: "Procedure", kind: "procedure_note", format: "bullets" }, facts, { patient, encounter: enc, template, utterances: utts });
    const at = note.sections.findIndex((s) => /assessment|plan|^ap$/i.test(s.key));
    note = { ...note, sections: at >= 0 ? [...note.sections.slice(0, at + 1), sec, ...note.sections.slice(at + 1)] : [...note.sections, sec] };
  }
  note = applyStyle(note, rules);
  note = applyReplacements(note, await vocabulary.replacements(enc.userId, enc.orgId));
  note = scoreSupport(note, utts, patient?.chart);
  note.meta.warnings = warnings;
  note.meta.detail = detail;

  const omissions = detectOmissions(note, facts, template);
  const minutes = Math.round((enc.durationS || (utts.at(-1)?.tEnd ?? 0)) / 60);
  const pediatric = patient ? ageFrom(patient.dob) < 18 : false;
  const priorVisits = (await encounters.list(user, { patientId: enc.patientId ?? "__none__" })).filter((e) => e.id !== enc!.id && e.status === "signed").length;
  const patientType = enc.visitType === "new" || (!patient?.chart.priorVisits?.length && !priorVisits) ? "new" : "established";
  const baseCoding = computeCoding(facts, { awv: template.id === "awv" ? awvReview(utts, patient?.chart, facts) : undefined, wellChild: template.id === "peds_well" && patient ? wellChild(ageInMonths(patient.dob, new Date(enc.scheduledAt)), utts) : undefined, prenatal: template.id === "ob_prenatal" ? { codes: prenatalCodes(patient?.chart.pregnancy, extractPrenatal(utts, patient?.chart.pregnancy, new Date(enc.scheduledAt))), globalPackage: true } : undefined, procedures: extractProcedures(utts), therapy: therapyContext(template.id, utts, patient), oncology: oncologyContext(template.id, utts, patient), patientType, minutes, chart: patient?.chart, pediatric, hccFor: hccMapper(patient, enc.scheduledAt), psychotherapy: template.id === "bh_group" ? "group" : template.id === "psych_med_mgmt" ? "addon" : template.id.startsWith("bh_") ? "standalone" : template.id === "behavioral" ? "intake" : undefined, psychotherapyMinutes: template.id === "psych_med_mgmt" ? psychotherapyMinutes(utts) : undefined, encounterClass: enc.visitType === "ed" || enc.setting === "ed" ? "ed" : enc.visitType === "inpatient" ? "initial_inpatient" : enc.visitType === "progress" ? "subsequent_inpatient" : enc.visitType === "discharge" ? "discharge" : "office" });
  const { tcmForVisit } = await import("./tcm");
  const tcm = await tcmForVisit(user, enc, utts, baseCoding.em.level);
  if (tcm) {
    baseCoding.tcm = tcm;
    if (tcm.code) baseCoding.em = { ...baseCoding.em, code: tcm.code, timeBased: undefined };
    else baseCoding.em.auditRisk.notes.push(`Transitional care management not billable yet: ${tcm.unmet.join("; ")}.`);
  }
  const coding = await enrichCoding(user, enc, patient, baseCoding, facts);
  const staged = stageOrders(facts, { chart: patient?.chart, ageYears: patient ? ageFrom(patient.dob) : undefined, now: new Date(enc.scheduledAt) });
  const coverage = computeCoverage(facts, { visitType: enc.visitType });

  const summaries: Record<string, PatientSummary> = { en: buildPatientSummary(facts, patient, "en") };
  const outLang = enc.outputLang !== "en" ? enc.outputLang : patient?.language && patient.language !== "en" ? patient.language : null;
  if (outLang) {
    let s: PatientSummary | null = outLang === "es" ? buildPatientSummary(facts, patient, "es") : null;
    if (useLlm) {
      try {
        s = await translateSummaryWithClaude(summaries.en, outLang);
      } catch {
        warnings.push("The translated summary came from the backup writer. Have a fluent speaker check it.");
      }
    }
    if (s) summaries[outLang] = s;
  }
  const letters = buildReferralLetters(facts, note, patient, { name: clinician.name, specialty: clinician.specialty }, new Date(enc.scheduledAt));

  await notes.create(enc.id, note, user.id);
  await artifacts.set(enc.id, "coding", coding);
  await artifacts.set(enc.id, "coverage", coverage);
  await artifacts.set(enc.id, "omissions", omissions);
  await artifacts.set(enc.id, "summaries", summaries);
  await artifacts.set(enc.id, "letters", letters);
  await artifacts.set(enc.id, "interpreter", interpretation);
  await artifacts.set(enc.id, "facts", {
    chiefComplaint: facts.chiefComplaint,
    problems: facts.problems.map((p) => ({ key: p.key, label: p.label, icd10: p.icd10, status: p.status ?? null })),
    interpreter: facts.interpreter,
    languages: facts.languages,
  });
  const savedOrders = await orders.replace(enc.id, staged);
  const { criticalCareMinutes } = await import("../engine/ed");
  const billCtx = { ...billingContext(enc, patient, patientType, minutes, savedOrders, false, criticalCareMinutes(utts)), ref: await referenceFor(enc, user.orgId) };
  await artifacts.set(enc.id, "claim", await withFacility(enc, buildClaim(facts, coding, billCtx)));
  const prevPa = (await artifacts.get<import("../engine/priorauth").PaPacket[]>(enc.id, "priorAuth")) ?? [];
  await artifacts.set(enc.id, "priorAuth", buildPriorAuths(facts, coding, savedOrders, paContext(clinician.name, enc, patient)).map((p) => ({ ...p, submission: prevPa.find((x) => x.service === p.service)?.submission ?? p.submission })));
  await encounters.update(user, enc.id, { status: "review", endedAt: enc.endedAt ?? new Date().toISOString() });
  await syncTasks(user, enc);
  const { autoDocuments } = await import("./documents");
  await autoDocuments(user, enc);
  const { qualityFor } = await import("./quality");
  await qualityFor(user, enc);
  if (note.meta.sensitive && (await audioChunks.list(enc.id)).length) await deleteAudio(user, enc.id, "behavioral health privacy: audio is not retained after transcription");
  const stats = supportStats(note);
  const { emit } = await import("./platform");
  await emit(enc.orgId, "note.generated", { encounterId: enc.id, patientId: enc.patientId, engine: note.meta.engine, template: template.id });
  await audit.log(user, enc.id, "note.generated", { engine: note.meta.engine, model: note.meta.model ?? null, template: template.id, ms: Date.now() - started, sentences: stats.total, supportedPct: stats.pct, omissions: omissions.length });
  return { note, warnings };
}

function therapyContext(templateId: string, utts: import("../types").Utterance[], patient: Patient | null): CodingContext["therapy"] {
  const discipline = therapyDiscipline(templateId);
  if (!discipline) return undefined;
  return { discipline, facts: extractTherapy(utts, { comorbidities: (patient?.chart.problems ?? []).length, evaluation: therapyEvaluation(templateId, utts) }) };
}

async function withFacility<T extends import("../engine/billing").Claim>(enc: Encounter, claim: T): Promise<T> {
  if (!enc.locationId) return claim;
  const { locations } = await import("./locations");
  const loc = await locations.get((await encounters.byIdUnscoped(enc.id))?.orgId ?? "", enc.locationId);
  if (!loc) return claim;
  return { ...claim, serviceFacility: { name: loc.name, address: loc.address }, placeOfService: claim.placeOfService === "11" && loc.pos !== "11" ? loc.pos : claim.placeOfService };
}

function oncologyContext(templateId: string, utts: import("../types").Utterance[], patient: Patient | null): CodingContext["oncology"] {
  if (!templateId.startsWith("onc_") && !patient?.chart.oncology) return undefined;
  const f = extractOncology(utts, patient?.chart.oncology);
  if (!f.cancer && !f.regimen) return undefined;
  const labs = f.toxicities.filter((t) => /count decreased|Anemia/.test(t.term)).flatMap((t) => t.evidence);
  return {
    cancer: f.cancer ? { code: f.cancer.icd10, label: f.cancer.label, evidence: f.cancer.evidence.filter((e) => e !== "chart") } : null,
    monitoring: needsToxicityMonitoring(f) ? [...(f.regimen?.evidence ?? []), ...labs].filter((e) => e !== "chart") : [],
    sideEffects: f.toxicities.map((t) => ({ label: t.term, code: t.icd10, grade: t.grade, evidence: t.evidence })),
    progression: f.response?.text === "progressive disease" ? f.response.evidence : null,
  };
}

function billingContext(enc: Encounter, patient: Patient | null, patientType: "new" | "established", minutes: number, list: import("../types").StagedOrder[], final = false, criticalCareMinutes = 0) {
  const age = patient ? ageFrom(patient.dob, new Date(enc.scheduledAt)) : 40;
  return { age, sex: patient?.sex ?? "X", setting: enc.visitType === "ed" ? "ed" : enc.setting, criticalCareMinutes, patientType, chart: patient?.chart, minutes, orders: list, at: new Date(enc.scheduledAt), final, payer: payerFor(patient, age) } as const;
}

function paContext(clinicianName: string, enc: Encounter, patient: Patient | null) {
  const bmi = Number.parseFloat(patient?.chart.vitals?.BMI ?? "");
  return { chart: patient?.chart, patientName: patient?.name ?? "Patient", dob: patient?.dob ?? "", clinician: clinicianName, date: new Date(enc.scheduledAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), bmi: Number.isFinite(bmi) ? bmi : undefined };
}

export async function finalizeClaim(user: User, enc: Encounter) {
  const { facts, patient } = await factsFor(user, enc);
  const coding = await artifacts.get<ReturnType<typeof computeCoding>>(enc.id, "coding");
  if (!coding) return null;
  const patientType = coding.em.patientType;
  const minutes = Math.round((enc.durationS || 0) / 60);
  const { criticalCareMinutes } = await import("../engine/ed");
  const claim = await withFacility(enc, buildClaim(facts, coding, { ...billingContext(enc, patient, patientType, minutes, await orders.list(enc.id), true, criticalCareMinutes(await utterances.list(enc.id))), ref: await referenceFor(enc, user.orgId) }));
  const existing = await claims.get(enc.id);
  const status = claimStatus(claim);
  return claims.save(enc.userId, enc.id, status, claim, [...(existing?.history ?? []), { at: new Date().toISOString(), action: "created", note: status === "ready" ? "No edits; ready to submit" : `${claim.edits.filter((e) => e.severity !== "info").length} edit(s) need review` }]);
}

export async function saveNoteEdits(user: User, encId: string, note: Note, reason = "edit") {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Error("Signed notes are locked. Create an addendum instead.");
  const { facts, patient } = await factsFor(user, enc);
  const template = await templateFor(user, enc);
  const scored = scoreSupport(note, await utterances.list(enc.id), patient?.chart);
  const source = /dictat/.test(reason) ? "dictation" : /assist/.test(reason) ? "assistant" : /quality|calculator|omission|default|cdi/.test(reason) ? "suggestion" : /restore/.test(reason) ? "restore" : "edit";
  await notes.saveContent(enc.id, scored, { authorId: user.id, source, reason });
  const omissions: OmissionFlag[] = detectOmissions(scored, facts, template);
  await artifacts.set(enc.id, "omissions", omissions);
  const { qualityFor } = await import("./quality");
  await qualityFor(user, enc);
  return { note: scored, omissions };
}

export async function signEncounter(user: User, encId: string, opts: { force?: boolean; dryRun?: boolean } = {}) {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") return { signed: true, blockers: [] as string[] };
  if (enc.visitType === "group" && !enc.patientId) throw new Invalid("This is the group recording. Create and sign each member's note from the group page.");
  assertNotGuest(user, "sign");
  if (!canSign(user, enc)) throw new Forbidden(user.role === "scribe" ? "Scribes can prepare notes but only the treating clinician can sign." : "Only the treating clinician can sign this note.");
  const rec = await notes.latest(enc.id);
  if (!rec) throw new Error("Generate a note before signing");
  const orderList = await orders.list(enc.id);
  const staged = orderList.filter((o) => o.status === "staged");
  const blocked = orderList.filter((o) => o.status === "accepted" && o.alerts.some((a) => a.level === "block"));
  const unsupported = rec.content.sections.flatMap((s) => s.sentences).filter((s) => !s.pending && s.support === "none" && s.kind !== "default");
  if (rec.content.sections.some((s) => /risk/i.test(s.key))) {
    const { assessRisk } = await import("../engine/behavioral");
    const risk = assessRisk(await utterances.list(enc.id));
    const riskText = rec.content.sections.filter((s) => /risk/i.test(s.key)).flatMap((s) => s.sentences.map((x) => x.text)).join(" ");
    const missing = risk.missing.filter((m) => !new RegExp(m.split(" ")[0], "i").test(riskText.replace(/Suicidal ideation/i, "")));
    if (risk.ideation && risk.ideation !== "none" && missing.length) return { signed: false, blockers: [`Suicide risk assessment is incomplete. Suicidal ideation was disclosed, but the note does not document: ${missing.join(", ")}.`] };
  }
  const blanks = rec.content.sections.flatMap((s) => s.sentences).filter((s) => !s.pending && s.text.includes("***"));
  if (blanks.length) return { signed: false, blockers: [`${blanks.length} line${blanks.length > 1 ? "s" : ""} still ${blanks.length > 1 ? "have" : "has"} *** blanks to fill in: ${blanks.map((b) => `"${b.text.slice(0, 60)}"`).join(", ")}.`] };
  const blockers: string[] = [];
  if (blocked.length) blockers.push(`${blocked.length} accepted order(s) have a blocking safety alert: ${blocked.map((o) => o.name).join(", ")}.`);
  if (!opts.force) {
    if (staged.length) blockers.push(`${staged.length} order(s) discussed in the visit are still unreviewed: ${staged.map((o) => o.name).join(", ")}.`);
    if (unsupported.length) blockers.push(`${unsupported.length} sentence(s) have no supporting evidence in the transcript.`);
    const pat = enc.patientId ? await patients.get(user, enc.patientId) : null;
    const { checkConsistency } = await import("../engine/consistency");
    for (const iss of checkConsistency(rec.content, pat ? { dob: pat.dob, sex: pat.sex, pronouns: pat.pronouns } : null, new Date(enc.scheduledAt))) blockers.push(iss.message);
  }
  const plan = await cosignPlan(user);
  if (plan.required && !plan.supervisor) return { signed: false, blockers: [`Your notes need a co-signature, but no supervising physician is assigned to you. Ask an admin to set one in Admin → Members.`] };
  if (blockers.length && (blocked.length || !opts.force)) return { signed: false, blockers };
  if (opts.dryRun) return { signed: false, blockers: [] as string[] };

  const consent = await consents.latest(enc.id);
  const final: Note = {
    ...rec.content,
    sections: rec.content.sections.map((s) => ({ ...s, sentences: s.sentences.filter((x) => !x.pending) })),
  };
  if (consent?.decision === "granted" && !final.sections.some((s) => s.key === "__consent")) {
    final.sections.push({ key: "__consent", title: "Documentation Consent", format: "paragraph", sentences: [{ id: "consent_1", text: consent.statement, evidence: [], kind: "system", support: "strong" }] });
  }
  await notes.saveContent(enc.id, final, { authorId: user.id, source: "signature", reason: "signed" });
  await notes.setStatus(enc.id, "signed");
  const signedAt = new Date().toISOString();
  await encounters.update(user, enc.id, { status: "signed", signedAt });
  const cosign = await recordSignature(user, enc, final, signedAt);

  const candidates = learnFromEdits(rec.generated, final);
  for (const c of candidates) await styleRules.learn(enc.userId, c);
  const genText = JSON.stringify(rec.generated.sections.map((s) => s.sentences.filter((x) => !x.pending).map((x) => x.text)));
  const finText = JSON.stringify(final.sections.filter((s) => s.key !== "__consent").map((s) => s.sentences.map((x) => x.text)));
  const edited = genText !== finText;
  const editRatio = editDistanceRatio(genText, finText);
  const { maybeSample } = await import("./qa");
  await maybeSample(user.orgId, enc.id, enc.userId);
  const { emit } = await import("./platform");
  await emit(user.orgId, "note.signed", { encounterId: enc.id, patientId: enc.patientId, signedAt, cosignPending: !!cosign });
  await audit.log(user, enc.id, "note.signed", { edited, editRatio, learned: candidates.length, forced: !!opts.force, overrides: blockers });
  await finalizeClaim(user, (await encounters.get(user, enc.id))!);
  const { sendNoteHl7 } = await import("./hl7");
  await sendNoteHl7(user, enc.id).catch(() => null);
  const { onTcmSigned } = await import("./tcm");
  await onTcmSigned(user, enc.id, (await artifacts.get<CodingResult>(enc.id, "coding"))?.tcm);
  await holdClaimForCosign(user, enc.id, cosign);
  const given = orderList.filter((o) => o.kind === "vaccine" && o.status === "accepted");
  if (given.length && enc.patientId) {
    const pat = await patients.get(user, enc.patientId);
    if (pat) await patients.updateChart(user, pat.id, { ...pat.chart, immunizations: [...(pat.chart.immunizations ?? []), ...given.map((o) => ({ name: o.name, date: enc.scheduledAt.slice(0, 10) }))] });
  }
  await syncTasks(user, enc);
  if (enc.patientId) {
    const pat = await patients.get(user, enc.patientId);
    const tpl = enc.templateId ?? "";
    if (pat && (pat.chart.oncology || tpl.startsWith("onc_"))) {
      const profile = updateProfile(pat.chart.oncology, extractOncology(await utterances.list(enc.id), pat.chart.oncology), enc.scheduledAt);
      if (profile) await patients.updateChart(user, pat.id, { ...pat.chart, oncology: profile });
    }
  }
  if (enc.admissionId) {
    const { onInpatientSigned } = await import("./inpatient");
    await onInpatientSigned(user, (await encounters.get(user, enc.id))!);
  }
  if (retentionDays(user) === 0) await deleteAudio(user, enc.id, "signed (retention: delete at signing)");
  await purgeExpired(user);
  const { purgeTranscripts } = await import("./retention");
  await purgeTranscripts(user.orgId);
  const { onSigned } = await import("./growth");
  await onSigned(user).catch(() => null);
  return { signed: true, blockers: [] as string[], learned: candidates.length, cosign: cosign ? { supervisor: cosign.supervisorName } : null };
}

function editDistanceRatio(a: string, b: string) {
  if (a === b) return 0;
  const wa = a.split(/\s+/);
  const wb = new Set(b.split(/\s+/));
  const kept = wa.filter((w) => wb.has(w)).length;
  const total = Math.max(wa.length, b.split(/\s+/).length);
  return Math.round((1 - kept / total) * 1000) / 1000;
}

export async function assist(user: User, encId: string, message: string, opts: { save?: boolean } = {}) {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  const rec = await notes.latest(enc.id);
  const utts = await utterances.list(enc.id);
  const patient = enc.patientId ? await patients.get(user, enc.patientId) : undefined;
  let result = localAssist(message, rec?.content ?? null, utts, patient?.chart);
  if (result.action === "none" && llmEnabled()) {
    try {
      const out = await assistWithClaude({ message, note: rec?.content ?? null, utterances: utts, chart: patient?.chart });
      let patched: Note | undefined;
      if (rec && out.edits.length) {
        patched = {
          ...rec.content,
          sections: rec.content.sections.map((s) => {
            const e = out.edits.find((x) => x.sectionKey === s.key);
            if (!e) return s;
            return { ...s, sentences: e.sentences.map((x, i) => ({ id: `${s.key}_ai${Date.now()}_${i}`, text: x.text, evidence: x.evidence, kind: x.evidence.length ? ("fact" as const) : ("clinician" as const), support: "strong" as const, heading: x.heading || undefined, indent: x.indent || undefined })) };
          }),
        };
      }
      result = { reply: out.reply, citations: out.citations, note: patched, action: patched ? "edit" : "answer" };
    } catch {
      result = { ...result, reply: `${result.reply}\n\nThis answer came from the backup writer, so it may be shorter than usual.` };
    }
  }
  if (result.sources?.length && llmEnabled()) {
    try {
      const { answerFromEvidenceWithClaude } = await import("../llm");
      const { searchEvidence } = await import("../engine/evidence");
      const passages = searchEvidence(message).map((h) => h.entry);
      result = { ...result, reply: await answerFromEvidenceWithClaude(message, passages, patient?.chart) };
    } catch {
      result = { ...result };
    }
  }
  if (result.note && enc.status === "signed") {
    result = { ...result, note: undefined, rule: undefined, action: "none", reply: "This note is signed, so I didn't change it. Add an addendum instead." };
  } else if (result.note && opts.save !== false) {
    const saved = await saveNoteEdits(user, enc.id, result.note, "assistant");
    result = { ...result, note: saved.note };
  }
  if (opts.save === false) {
    await audit.log(user, enc.id, "assist.proposed", { action: result.action, message: message.slice(0, 200) });
    return result;
  }
  if (result.rule && enc.userId === user.id) {
    await styleRules.addManual(user.id, result.rule);
    await audit.log(user, enc.id, "style.rule_added", { kind: result.rule.kind, section: result.rule.section });
  }
  await audit.log(user, enc.id, "assist", { action: result.action, message: message.slice(0, 200) });
  return result;
}

export async function exportFhir(user: User, encId: string) {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  const rec = await notes.latest(enc.id);
  const patient = enc.patientId ? await patients.get(user, enc.patientId) : undefined;
  const coding = await artifacts.get<ReturnType<typeof computeCoding>>(enc.id, "coding");
  const clinician = await clinicianOf(enc);
  const title = (await templateFor(user, enc)).name;
  const orderList = await orders.list(enc.id);
  const text = rec ? (enc.status === "signed" ? await documentText(enc.id, rec.content) : noteText(rec.content)) : "";
  const addendaList = await addenda.list(enc.id);
  const patientRef = { reference: `Patient/${patient?.id ?? "unknown"}`, display: patient?.name };
  const composition = {
    resourceType: "Composition",
    id: `comp-${enc.id}`,
    status: enc.status === "signed" ? "final" : "preliminary",
    type: { coding: [{ system: "http://loinc.org", code: "11506-3", display: "Progress note" }] },
    meta: rec?.content.meta.sensitive ? { security: [{ system: "http://terminology.hl7.org/CodeSystem/v3-Confidentiality", code: "R", display: "restricted" }, { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "PSY", display: "psychiatry disorder information sensitivity" }] } : undefined,
    subject: patientRef,
    encounter: { reference: `Encounter/${enc.id}` },
    date: enc.signedAt ?? new Date().toISOString(),
    author: [{ reference: `Practitioner/${enc.userId}`, display: clinician.name }],
    title,
    attester: enc.signedAt ? [{ mode: "legal", time: enc.signedAt, party: { reference: `Practitioner/${enc.userId}` } }] : undefined,
    section: (rec?.content.sections ?? []).map((s) => ({
      title: s.title,
      text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${s.sentences.filter((x) => !x.pending).map((x) => `<p>${escapeXml(x.text)}</p>`).join("")}</div>` },
    })),
  };
  const conditions = (coding?.diagnoses ?? []).map((d, i) => ({
    resourceType: "Condition",
    id: `cond-${enc.id}-${i}`,
    subject: patientRef,
    encounter: { reference: `Encounter/${enc.id}` },
    code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: d.code, display: d.label }] },
    verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: d.confidence >= 0.8 ? "confirmed" : "provisional" }] },
  }));
  const docRef = {
    resourceType: "DocumentReference",
    id: `doc-${enc.id}`,
    status: "current",
    docStatus: enc.status === "signed" ? "final" : "preliminary",
    type: composition.type,
    subject: patientRef,
    date: composition.date,
    author: composition.author,
    content: [{ attachment: { contentType: "text/plain", data: Buffer.from(text).toString("base64"), title: composition.title } }],
    context: { encounter: [{ reference: `Encounter/${enc.id}` }] },
  };
  const addendumDocs = addendaList.map((a) => ({
    resourceType: "DocumentReference",
    id: `doc-${a.id}`,
    status: "current",
    docStatus: "final",
    type: composition.type,
    subject: patientRef,
    date: a.createdAt,
    author: [{ reference: `Practitioner/${a.userId}`, display: a.author }],
    description: a.kind === "attestation" ? "Supervising physician attestation" : a.kind.replace("_", " "),
    relatesTo: [{ code: "appends", target: { reference: `DocumentReference/doc-${enc.id}` } }],
    content: [{ attachment: { contentType: "text/plain", data: Buffer.from(a.text).toString("base64") } }],
  }));
  const serviceRequests = orderList.filter((o) => o.status === "accepted" && o.kind !== "medication" && o.kind !== "follow_up").map((o) => ({ resourceType: "ServiceRequest", id: `sr-${o.id}`, status: "active", intent: "order", code: { text: o.name }, subject: patientRef, encounter: { reference: `Encounter/${enc.id}` }, note: o.detail ? [{ text: o.detail }] : undefined }));
  const medRequests = orderList.filter((o) => o.status === "accepted" && o.kind === "medication").map((o) => ({ resourceType: "MedicationRequest", id: `mr-${o.id}`, status: "active", intent: "order", medicationCodeableConcept: { text: o.name }, subject: patientRef, dosageInstruction: o.detail ? [{ text: o.detail }] : undefined }));
  await audit.log(user, enc.id, "export.fhir", {});
  return {
    resourceType: "Bundle",
    type: "document",
    timestamp: new Date().toISOString(),
    entry: [composition, docRef, ...addendumDocs, ...conditions, ...serviceRequests, ...medRequests].map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function noteText(note: Note) {
  const lines: string[] = [];
  for (const sec of note.sections) {
    const xs = sec.sentences.filter((s) => !s.pending);
    if (!xs.length) continue;
    lines.push(sec.title.toUpperCase());
    if (sec.format === "paragraph") lines.push(xs.map((s) => s.text).join(" "));
    else for (const s of xs) lines.push(`${s.indent ? "   - " : s.heading ? "" : "- "}${s.text}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export { users };

export async function refreshDraftClaim(user: User, enc: Encounter) {
  const { facts, patient } = await factsFor(user, enc);
  const coding = await artifacts.get<CodingResult>(enc.id, "coding");
  if (!coding) return null;
  const minutes = Math.round((enc.durationS || 0) / 60);
  const { criticalCareMinutes } = await import("../engine/ed");
  const claim = await withFacility(enc, buildClaim(facts, coding, { ...billingContext(enc, patient, coding.em.patientType, minutes, await orders.list(enc.id), false, criticalCareMinutes(await utterances.list(enc.id))), ref: await referenceFor(enc, user.orgId) }));
  await artifacts.set(enc.id, "claim", claim);
  return claim;
}

export async function reviseDiagnoses(user: User, encId: string, change: { kind: "answer"; queryId: string; code: string | null } | { kind: "add"; code: string } | { kind: "remove"; code: string }) {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Error("This note is signed. Record clarifications as an addendum and correct the claim in billing review.");
  const coding = await artifacts.get<CodingResult>(enc.id, "coding");
  if (!coding) throw new Error("Draft the note before coding");
  const { facts, patient } = await factsFor(user, enc);
  const answers = (await artifacts.get<CdiAnswer[]>(enc.id, "cdi_answers")) ?? [];
  let diagnoses = [...coding.diagnoses];
  let noteLine: string | null = null;
  const release = icdReleaseFor(enc.scheduledAt);
  if (!release) throw new Error("No ICD-10-CM release is loaded for this date of service");
  if (change.kind === "answer") {
    const i = (coding.dxDetail ?? []).findIndex((d) => d.query?.id === change.queryId);
    if (i < 0) throw new Error("Query not found; it may already be answered");
    const q = coding.dxDetail![i].query!;
    if (change.code === null) {
      answers.push({ queryId: q.id, from: q.code, to: null, label: "Clinically undetermined", by: user.name, at: new Date().toISOString() });
    } else {
      const opt = q.options.find((o) => o.code === change.code);
      if (!opt) throw new Error("Choose one of the query options");
      diagnoses[i] = { ...diagnoses[i], code: opt.code, label: opt.label, rationale: `${diagnoses[i].rationale}; specified by clinician in response to a documentation query`, confidence: 1 };
      answers.push({ queryId: q.id, from: q.code, to: opt.code, label: opt.label, by: user.name, at: new Date().toISOString() });
      noteLine = `Clarified diagnosis: ${opt.label} (${opt.code}).`;
    }
  } else if (change.kind === "add") {
    const entry = release.lookup(change.code);
    if (!entry?.billable) throw new Error(`${change.code} is not a billable ICD-10-CM code in ${release.meta.version}`);
    if (diagnoses.some((d) => d.code.replace(".", "") === entry.code)) throw new Error(`${entry.dotted} is already on the diagnosis list`);
    diagnoses.push({ code: entry.dotted, system: "ICD-10-CM", label: entry.long, rationale: "Added by clinician per ICD-10-CM instructional note", evidence: [], confidence: 1 });
    noteLine = `Additional diagnosis: ${entry.long} (${entry.dotted}).`;
  } else {
    diagnoses = diagnoses.filter((d) => d.code !== change.code);
  }
  const base = { ...coding, diagnoses };
  const enriched = await enrichCoding(user, enc, patient, base, facts);
  const answered = new Map(answers.map((a) => [a.from, a]));
  enriched.dxDetail = enriched.dxDetail?.map((d) => (d.query && answered.get(d.code)?.to === null ? { ...d, query: { ...d.query, answer: { code: null, label: "Clinically undetermined", by: answered.get(d.code)!.by, at: answered.get(d.code)!.at } } } : d));
  await artifacts.set(enc.id, "coding", enriched);
  await artifacts.set(enc.id, "cdi_answers", answers);
  if (noteLine) {
    const rec = await notes.latest(enc.id);
    if (rec) {
      const sections = rec.content.sections.map((s) => (/assessment/i.test(s.title) ? { ...s, sentences: [...s.sentences, { id: `${s.key}_cdi_${Date.now().toString(36)}`, text: noteLine!, evidence: [], kind: "clinician" as const, support: "strong" as const, edited: true }] } : s));
      await notes.saveContent(enc.id, { ...rec.content, sections });
    }
  }
  const claim = await refreshDraftClaim(user, enc);
  await audit.log(user, enc.id, change.kind === "answer" ? "cdi.answered" : change.kind === "add" ? "dx.added" : "dx.removed", change.kind === "answer" ? { query: change.queryId, answer: change.code ?? "undetermined" } : { code: change.code });
  return { coding: enriched, claim };
}

interface CdiAnswer {
  queryId: string;
  from: string;
  to: string | null;
  label: string;
  by: string;
  at: string;
}
