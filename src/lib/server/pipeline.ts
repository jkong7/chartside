import { createHash } from "node:crypto";
import { assistWithClaude, generateNoteWithClaude, llmEnabled, llmModel, translateSummaryWithClaude } from "../llm";
import { localAssist } from "../engine/assist";
import { computeCoding } from "../engine/coding";
import { computeCoverage } from "../engine/coverage";
import { extractFacts, type Facts } from "../engine/extract";
import { buildReferralLetters } from "../engine/letter";
import { ALL_PARTY_STATES, DISCLOSURE_STATES, STATE_NAMES } from "../engine/lexicon";
import { buildNote } from "../engine/note";
import { stageOrders } from "../engine/orders";
import { applyStyle, learnFromEdits } from "../engine/style";
import { buildPatientSummary } from "../engine/summary";
import { systemTemplate } from "../engine/templates";
import { ageFrom } from "../engine/text";
import { detectOmissions, scoreSupport, supportStats } from "../engine/verify";
import type { ConsentRecord, Encounter, Note, OmissionFlag, Patient, PatientSummary } from "../types";
import { deleteAudio, finalPass, localDiarize, purgeExpired, retentionDays } from "./audio";
import { checkInterpretation } from "../engine/interpreter";
import { artifacts, audit, consents, encounters, notes, orders, patients, styleRules, templates, utterances, users, type User } from "./repo";

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

export function recordConsent(user: User, enc: Encounter, input: { decision: "granted" | "declined"; method: ConsentRecord["method"]; state: string; othersPresent: boolean }) {
  const { allParty, stateName } = consentScript(user.name, input.state);
  const when = new Date().toISOString();
  const statement =
    input.decision === "granted"
      ? `${input.method === "verbal" ? "Verbal" : input.method === "written" ? "Written" : "Patient-device"} consent for AI-assisted documentation was obtained by ${user.name} at ${when} using consent script ${CONSENT_SCRIPT_VERSION}. Visit location: ${stateName}${allParty ? " (all-party consent state" + (input.othersPresent ? "; all parties present consented" : "") + ")" : ""}.`
      : `Patient declined AI-assisted documentation at ${when}. No audio was captured; documentation will be completed manually.`;
  const digest = createHash("sha256").update(JSON.stringify({ enc: enc.id, user: user.id, ...input, statement, script: CONSENT_SCRIPT_VERSION })).digest("hex");
  const rec = consents.add({ encounterId: enc.id, userId: user.id, decision: input.decision, method: input.method, state: input.state, allParty, othersPresent: input.othersPresent, scriptVersion: CONSENT_SCRIPT_VERSION, statement, digest });
  audit.log(user.id, enc.id, input.decision === "granted" ? "consent.granted" : "consent.declined", { method: input.method, state: input.state, digest });
  return rec;
}

function templateFor(user: User, enc: Encounter) {
  return templates.get(user.id, enc.templateId ?? user.prefs.defaultTemplate ?? "soap") ?? systemTemplate("soap")!;
}

export function factsFor(user: User, enc: Encounter): { facts: Facts; patient: Patient | null } {
  const patient = enc.patientId ? patients.get(user.id, enc.patientId) ?? null : null;
  const utts = utterances.list(enc.id);
  return { facts: extractFacts(utts, patient?.chart, { pronouns: patient?.pronouns, sex: patient?.sex }), patient };
}

export function liveCoverage(user: User, enc: Encounter) {
  const { facts } = factsFor(user, enc);
  return {
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

export async function processEncounter(user: User, encId: string, opts: { templateId?: string; engine?: "local" | "auto" } = {}): Promise<ProcessResult> {
  let enc = encounters.get(user.id, encId);
  if (!enc) throw new Error("Encounter not found");
  if (opts.templateId && opts.templateId !== enc.templateId) enc = encounters.update(user.id, encId, { templateId: opts.templateId })!;
  const template = templateFor(user, enc);
  const warnings: string[] = [];
  const started = Date.now();
  if (opts.engine !== "local" && user.prefs.finalPass !== false && !utterances.list(enc.id).some((u) => u.source === "final")) {
    try {
      await finalPass(user, enc);
    } catch (err) {
      warnings.push(`High-accuracy re-transcription was unavailable (${err instanceof Error ? err.message : "error"}); the live transcript was used.`);
    }
  }
  localDiarize(user, enc);
  const utts = utterances.list(enc.id);
  if (!utts.length) throw new Error("Audio was recorded but no transcript is available. Add DEEPGRAM_API_KEY for server-side transcription, or type the conversation.");
  const { facts, patient } = factsFor(user, enc);
  const rules = styleRules.list(user.id);
  const interpretation = checkInterpretation(utts);

  let note: Note | null = null;
  const useLlm = llmEnabled() && opts.engine !== "local";
  if (useLlm && utts.length) {
    try {
      note = await generateNoteWithClaude({ utterances: utts, patient, template, reason: enc.reason, visitType: enc.visitType, rules });
    } catch (err) {
      warnings.push(`Claude (${llmModel()}) was unavailable (${err instanceof Error ? err.message : "error"}); used the on-device engine instead.`);
    }
  }
  if (!note) note = buildNote(facts, { patient, encounter: enc, template });
  note = applyStyle(note, rules);
  note = scoreSupport(note, utts, patient?.chart);
  note.meta.warnings = warnings;

  const omissions = detectOmissions(note, facts, template);
  const minutes = Math.round((enc.durationS || (utts.at(-1)?.tEnd ?? 0)) / 60);
  const pediatric = patient ? ageFrom(patient.dob) < 18 : false;
  const priorVisits = encounters.list(user.id, { patientId: enc.patientId ?? "__none__" }).filter((e) => e.id !== enc!.id && e.status === "signed").length;
  const patientType = enc.visitType === "new" || (!patient?.chart.priorVisits?.length && !priorVisits) ? "new" : "established";
  const coding = computeCoding(facts, { patientType, minutes, chart: patient?.chart, pediatric });
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
        warnings.push("Summary translation via Claude failed; showing the on-device version.");
      }
    }
    if (s) summaries[outLang] = s;
  }
  const letters = buildReferralLetters(facts, note, patient, { name: user.name, specialty: user.specialty }, new Date(enc.scheduledAt));

  notes.create(enc.id, note);
  artifacts.set(enc.id, "coding", coding);
  artifacts.set(enc.id, "coverage", coverage);
  artifacts.set(enc.id, "omissions", omissions);
  artifacts.set(enc.id, "summaries", summaries);
  artifacts.set(enc.id, "letters", letters);
  artifacts.set(enc.id, "interpreter", interpretation);
  artifacts.set(enc.id, "facts", {
    chiefComplaint: facts.chiefComplaint,
    problems: facts.problems.map((p) => ({ key: p.key, label: p.label, icd10: p.icd10, status: p.status ?? null })),
    interpreter: facts.interpreter,
    languages: facts.languages,
  });
  orders.replace(enc.id, staged);
  encounters.update(user.id, enc.id, { status: "review", endedAt: enc.endedAt ?? new Date().toISOString() });
  const stats = supportStats(note);
  audit.log(user.id, enc.id, "note.generated", { engine: note.meta.engine, model: note.meta.model ?? null, template: template.id, ms: Date.now() - started, sentences: stats.total, supportedPct: stats.pct, omissions: omissions.length });
  return { note, warnings };
}

export function saveNoteEdits(user: User, encId: string, note: Note) {
  const enc = encounters.get(user.id, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Error("Signed notes are locked. Create an addendum instead.");
  const { facts, patient } = factsFor(user, enc);
  const template = templateFor(user, enc);
  const scored = scoreSupport(note, utterances.list(enc.id), patient?.chart);
  notes.saveContent(enc.id, scored);
  const omissions: OmissionFlag[] = detectOmissions(scored, facts, template);
  artifacts.set(enc.id, "omissions", omissions);
  return { note: scored, omissions };
}

export function signEncounter(user: User, encId: string, opts: { force?: boolean } = {}) {
  const enc = encounters.get(user.id, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") return { signed: true, blockers: [] as string[] };
  const rec = notes.latest(enc.id);
  if (!rec) throw new Error("Generate a note before signing");
  const staged = orders.list(enc.id).filter((o) => o.status === "staged");
  const blocked = orders.list(enc.id).filter((o) => o.status === "accepted" && o.alerts.some((a) => a.level === "block"));
  const unsupported = rec.content.sections.flatMap((s) => s.sentences).filter((s) => !s.pending && s.support === "none" && s.kind !== "default");
  const blockers: string[] = [];
  if (blocked.length) blockers.push(`${blocked.length} accepted order(s) have a blocking safety alert: ${blocked.map((o) => o.name).join(", ")}.`);
  if (!opts.force) {
    if (staged.length) blockers.push(`${staged.length} order(s) discussed in the visit are still unreviewed: ${staged.map((o) => o.name).join(", ")}.`);
    if (unsupported.length) blockers.push(`${unsupported.length} sentence(s) have no supporting evidence in the transcript.`);
  }
  if (blockers.length && (blocked.length || !opts.force)) return { signed: false, blockers };

  const consent = consents.latest(enc.id);
  const final: Note = {
    ...rec.content,
    sections: rec.content.sections.map((s) => ({ ...s, sentences: s.sentences.filter((x) => !x.pending) })),
  };
  if (consent?.decision === "granted" && !final.sections.some((s) => s.key === "__consent")) {
    final.sections.push({ key: "__consent", title: "Documentation Consent", format: "paragraph", sentences: [{ id: "consent_1", text: consent.statement, evidence: [], kind: "system", support: "strong" }] });
  }
  notes.saveContent(enc.id, final);
  notes.setStatus(enc.id, "signed");
  const signedAt = new Date().toISOString();
  encounters.update(user.id, enc.id, { status: "signed", signedAt });

  const candidates = learnFromEdits(rec.generated, final);
  for (const c of candidates) styleRules.learn(user.id, c);
  const genText = JSON.stringify(rec.generated.sections.map((s) => s.sentences.filter((x) => !x.pending).map((x) => x.text)));
  const finText = JSON.stringify(final.sections.filter((s) => s.key !== "__consent").map((s) => s.sentences.map((x) => x.text)));
  const edited = genText !== finText;
  const editRatio = editDistanceRatio(genText, finText);
  audit.log(user.id, enc.id, "note.signed", { edited, editRatio, learned: candidates.length, forced: !!opts.force, overrides: blockers });
  if (retentionDays(user) === 0) deleteAudio(user.id, enc.id, "signed (retention: delete at signing)");
  purgeExpired(user);
  return { signed: true, blockers: [] as string[], learned: candidates.length };
}

function editDistanceRatio(a: string, b: string) {
  if (a === b) return 0;
  const wa = a.split(/\s+/);
  const wb = new Set(b.split(/\s+/));
  const kept = wa.filter((w) => wb.has(w)).length;
  const total = Math.max(wa.length, b.split(/\s+/).length);
  return Math.round((1 - kept / total) * 1000) / 1000;
}

export async function assist(user: User, encId: string, message: string) {
  const enc = encounters.get(user.id, encId);
  if (!enc) throw new Error("Encounter not found");
  const rec = notes.latest(enc.id);
  const utts = utterances.list(enc.id);
  const patient = enc.patientId ? patients.get(user.id, enc.patientId) : undefined;
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
      result = { ...result, reply: `${result.reply}\n\nClaude was unavailable, so this answer comes from the on-device engine.` };
    }
  }
  if (result.note && enc.status !== "signed") {
    const saved = saveNoteEdits(user, enc.id, result.note);
    result = { ...result, note: saved.note };
  }
  audit.log(user.id, enc.id, "assist", { action: result.action, message: message.slice(0, 200) });
  return result;
}

export function exportFhir(user: User, encId: string) {
  const enc = encounters.get(user.id, encId);
  if (!enc) throw new Error("Encounter not found");
  const rec = notes.latest(enc.id);
  const patient = enc.patientId ? patients.get(user.id, enc.patientId) : undefined;
  const coding = artifacts.get<ReturnType<typeof computeCoding>>(enc.id, "coding");
  const text = rec ? noteText(rec.content) : "";
  const patientRef = { reference: `Patient/${patient?.id ?? "unknown"}`, display: patient?.name };
  const composition = {
    resourceType: "Composition",
    id: `comp-${enc.id}`,
    status: enc.status === "signed" ? "final" : "preliminary",
    type: { coding: [{ system: "http://loinc.org", code: "11506-3", display: "Progress note" }] },
    subject: patientRef,
    encounter: { reference: `Encounter/${enc.id}` },
    date: enc.signedAt ?? new Date().toISOString(),
    author: [{ reference: `Practitioner/${user.id}`, display: user.name }],
    title: templateFor(user, enc).name,
    attester: enc.signedAt ? [{ mode: "legal", time: enc.signedAt, party: { reference: `Practitioner/${user.id}` } }] : undefined,
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
  const serviceRequests = orders.list(enc.id).filter((o) => o.status === "accepted" && o.kind !== "medication" && o.kind !== "follow_up").map((o) => ({ resourceType: "ServiceRequest", id: `sr-${o.id}`, status: "active", intent: "order", code: { text: o.name }, subject: patientRef, encounter: { reference: `Encounter/${enc.id}` }, note: o.detail ? [{ text: o.detail }] : undefined }));
  const medRequests = orders.list(enc.id).filter((o) => o.status === "accepted" && o.kind === "medication").map((o) => ({ resourceType: "MedicationRequest", id: `mr-${o.id}`, status: "active", intent: "order", medicationCodeableConcept: { text: o.name }, subject: patientRef, dosageInstruction: o.detail ? [{ text: o.detail }] : undefined }));
  audit.log(user.id, enc.id, "export.fhir", {});
  return {
    resourceType: "Bundle",
    type: "document",
    timestamp: new Date().toISOString(),
    entry: [composition, docRef, ...conditions, ...serviceRequests, ...medRequests].map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
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
