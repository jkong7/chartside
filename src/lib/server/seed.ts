import { DEMO_PATIENTS, type DemoPatient } from "../demo/scripts";
import type { Note } from "../types";
import { encounters, notes, orders, patients, utterances, type User } from "./repo";
import { processEncounter, recordConsent, saveNoteEdits, signEncounter } from "./pipeline";
import { claimAction } from "./revenue";
import { audit, claims, orgs } from "./repo";

const ARCHIVE: { from: string; name: string; first: string; dob: string; mrn: string; daysAgo: number; time: string; edit: boolean; late?: boolean }[] = [
  { from: "gonzalez", name: "Linda Park", first: "Linda", dob: "1964-08-02", mrn: "099120", daysAgo: 13, time: "09:00", edit: true },
  { from: "carter", name: "Marcus Webb", first: "Marcus", dob: "1985-02-11", mrn: "099133", daysAgo: 12, time: "10:30", edit: false },
  { from: "shah", name: "Elena Russo", first: "Elena", dob: "1987-06-21", mrn: "099141", daysAgo: 11, time: "14:15", edit: true, late: true },
  { from: "kim", name: "Tyler Brooks", first: "Tyler", dob: "1999-10-30", mrn: "099152", daysAgo: 8, time: "11:00", edit: false },
  { from: "ramirez", name: "Lucia Torres", first: "Lucia", dob: "2019-12-04", mrn: "099168", daysAgo: 7, time: "15:30", edit: true },
  { from: "carter", name: "Noah Fischer", first: "Noah", dob: "1990-04-17", mrn: "099171", daysAgo: 6, time: "08:45", edit: false },
  { from: "gonzalez", name: "Grace Liu", first: "Grace", dob: "1959-01-26", mrn: "099185", daysAgo: 5, time: "13:00", edit: true, late: true },
  { from: "shah", name: "Aisha Bello", first: "Aisha", dob: "1978-09-09", mrn: "099192", daysAgo: 4, time: "09:30", edit: false },
  { from: "kim", name: "Owen Carter", first: "Owen", dob: "1995-05-05", mrn: "099203", daysAgo: 1, time: "16:00", edit: true },
];

export function localDate(daysAgo: number, time: string) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function coverageFor(dob: string, mrn: string) {
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
  return age >= 65 ? { payer: "Medicare" as const, plan: "Medicare Part B", memberId: `1EG4TE5MK${mrn.slice(-2)}` } : { payer: "Commercial" as const, plan: "Blue Cross PPO", memberId: `XOF${mrn}01` };
}

function addPatient(user: User, p: DemoPatient, override?: { name: string; dob: string; mrn: string }) {
  const dob = override?.dob ?? p.dob;
  const mrn = override?.mrn ?? p.mrn;
  return patients.create(user, {
    mrn,
    name: override?.name ?? p.name,
    dob,
    sex: p.sex,
    pronouns: p.pronouns,
    language: p.language,
    chart: { ...p.chart, coverage: p.chart.coverage ?? coverageFor(dob, mrn) },
  });
}

export async function seedSchedule(user: User) {
  const created = [];
  for (const p of DEMO_PATIENTS) {
    const pat = await addPatient(user, p);
    const enc = await encounters.create(user, {
      patientId: pat.id,
      scheduledAt: localDate(0, p.visit.time).toISOString(),
      visitType: p.visit.type,
      reason: p.visit.reason,
      templateId: p.visit.template,
      outputLang: p.visit.outputLang ?? "en",
    });
    created.push(enc);
  }
  return created;
}

function editNote(note: Note): Note {
  return {
    ...note,
    sections: note.sections.map((s) => {
      if (!/assessment|ap|plan/i.test(s.key)) return s;
      const kept = s.sentences.filter((x) => !/^Patient questions addressed/.test(x.text));
      return { ...s, sentences: [...kept, { id: `${s.key}_edit_rb`, text: "Patient verbalized understanding and agreement with the plan.", evidence: [], kind: "clinician", support: "strong", edited: true }] };
    }),
  };
}

export async function seedArchive(user: User) {
  for (const a of ARCHIVE) {
    const src = DEMO_PATIENTS.find((p) => p.key === a.from)!;
    const pat = await addPatient(user, src, { name: a.name, dob: a.dob, mrn: a.mrn });
    const start = localDate(a.daysAgo, a.time);
    const enc = await encounters.create(user, {
      patientId: pat.id,
      scheduledAt: start.toISOString(),
      visitType: src.visit.type,
      reason: src.visit.reason,
      templateId: src.visit.template,
      outputLang: src.visit.outputLang ?? "en",
    });
    await recordConsent(user, enc, { decision: "granted", method: "verbal", state: user.prefs.state ?? "IL", othersPresent: false });
    const firstName = src.name.split(" ")[0];
    let t = 0;
    await utterances.append(
      enc.id,
      src.script.map((l) => {
        const text = l.t.replace(new RegExp(`\\b${firstName}\\b`, "g"), a.first);
        const dur = Math.max(2.5, text.split(/\s+/).length * 0.42);
        const u = { speaker: l.s, speakerSource: "manual" as const, text, tStart: t, tEnd: t + dur, lang: "en" };
        t += dur + 0.6;
        return u;
      }),
    );
    const ended = new Date(start.getTime() + t * 1000);
    await encounters.update(user, enc.id, { status: "processing", startedAt: start.toISOString(), endedAt: ended.toISOString(), durationS: Math.round(t) });
    await processEncounter(user, enc.id, { engine: "local" });
    for (const o of await orders.list(enc.id)) if (o.status === "staged") await orders.setStatus(enc.id, o.id, o.alerts.some((x) => x.level === "block") ? "rejected" : "accepted");
    const rec = (await notes.latest(enc.id))!;
    if (a.edit) await saveNoteEdits(user, enc.id, editNote(rec.content));
    await signEncounter(user, enc.id, { force: true });
    const signedAt = a.late ? new Date(start.getTime()).setHours(21, 40 + (a.daysAgo % 15), 0, 0) : ended.getTime() + (4 + (a.daysAgo % 7) * 3) * 60000;
    const iso = new Date(signedAt).toISOString();
    await encounters.setSignedAt(enc.id, iso);
    await audit.retime(enc.id, "note.signed", iso);
    await audit.retime(enc.id, "note.signed", ended.toISOString(), true);
    const claim = await claims.get(enc.id);
    if (claim && !claim.content.edits.some((e) => e.severity === "error")) {
      if (a.daysAgo >= 7) {
        await claimAction(user, enc.id, "approve", {});
        await claimAction(user, enc.id, "submit", {});
        if (a.daysAgo === 11) {
          const sub = (await claims.get(enc.id))!;
          const em = sub.content.lines.find((l) => l.source === "em");
          if (em) await claimAction(user, enc.id, "remit", { remit: { payerClaimId: `PYR${a.mrn}`, lines: sub.content.lines.map((l) => (l.id === em.id ? { lineId: l.id, cpt: l.cpt, billed: l.charge, allowed: 0, paid: 0, patientResp: 0, adjustments: [{ group: "CO" as const, carc: "11", amount: l.charge }] } : { lineId: l.id, cpt: l.cpt, billed: l.charge, allowed: l.pricing?.allowed ?? 0, paid: Math.round((l.pricing?.allowed ?? 0) * 0.8 * 100) / 100, patientResp: Math.round((l.pricing?.allowed ?? 0) * 0.2 * 100) / 100, adjustments: [] })) } });
        } else if (a.daysAgo >= 8) await claimAction(user, enc.id, "remit", {});
      } else if (a.daysAgo === 5) {
        await claimAction(user, enc.id, "hold", { note: "Verify secondary insurance before submitting" });
      }
    }
  }
}

const DEMO_MESSAGES: { patient: string; body: string; hoursAgo: number }[] = [
  { patient: "Elena Russo", body: "Since my thyroid dose changed I've had a racing heart, and this morning I have chest pain that won't go away.", hoursAgo: 0.3 },
  { patient: "Lucia Torres", body: "Hola, mi hija tiene fiebre de 102 desde anoche y está vomitando. ¿Qué debo hacer?", hoursAgo: 1.5 },
  { patient: "Linda Park", body: "Hi, I'm almost out of my lisinopril. Can you send a refill to my CVS on Main Street?", hoursAgo: 3 },
  { patient: "Grace Liu", body: "I got a notification that my A1c results are in. What do they mean?", hoursAgo: 20 },
  { patient: "Marcus Webb", body: "Could I get a work note for missing Monday for the appointment?", hoursAgo: 26 },
];

export async function seedMessages(user: User) {
  const { receiveMessage } = await import("./inbox");
  const { run } = await import("../db");
  const list = await patients.list(user);
  for (const m of DEMO_MESSAGES) {
    const p = list.find((x) => x.name === m.patient);
    if (!p) continue;
    const id = await receiveMessage({ orgId: user.orgId, patient: p, assigneeId: user.id, body: m.body, channel: "portal", actor: user });
    await run("UPDATE messages SET received_at = ? WHERE id = ?", new Date(Date.now() - m.hoursAgo * 3600000).toISOString(), id);
  }
}

export async function seedDemo(user: User, opts: { archive?: boolean } = {}) {
  const org = await orgs.get(user.orgId);
  if (org && !org.settings.billing?.npi) await orgs.update(org.id, { settings: { ...org.settings, billing: { ...(org.settings.billing ?? {}), npi: "1234567893", tin: "12-3456789", demoIdentifiers: true } } });
  await seedSchedule(user);
  if (opts.archive !== false) {
    await seedArchive(user);
    await seedMessages(user);
  }
}
