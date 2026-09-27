import { run } from "../db";
import { DEMO_PATIENTS, type DemoPatient } from "../demo/scripts";
import type { Note } from "../types";
import { encounters, notes, orders, patients, utterances, type User } from "./repo";
import { processEncounter, recordConsent, saveNoteEdits, signEncounter } from "./pipeline";

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

function addPatient(userId: string, p: DemoPatient, override?: { name: string; dob: string; mrn: string }) {
  return patients.create(userId, {
    mrn: override?.mrn ?? p.mrn,
    name: override?.name ?? p.name,
    dob: override?.dob ?? p.dob,
    sex: p.sex,
    pronouns: p.pronouns,
    language: p.language,
    chart: p.chart,
  });
}

export function seedSchedule(user: User) {
  const created = [];
  for (const p of DEMO_PATIENTS) {
    const pat = addPatient(user.id, p);
    const enc = encounters.create(user.id, {
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
    const pat = addPatient(user.id, src, { name: a.name, dob: a.dob, mrn: a.mrn });
    const start = localDate(a.daysAgo, a.time);
    const enc = encounters.create(user.id, {
      patientId: pat.id,
      scheduledAt: start.toISOString(),
      visitType: src.visit.type,
      reason: src.visit.reason,
      templateId: src.visit.template,
      outputLang: src.visit.outputLang ?? "en",
    });
    recordConsent(user, enc, { decision: "granted", method: "verbal", state: user.prefs.state ?? "IL", othersPresent: false });
    const firstName = src.name.split(" ")[0];
    let t = 0;
    utterances.append(
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
    encounters.update(user.id, enc.id, { status: "processing", startedAt: start.toISOString(), endedAt: ended.toISOString(), durationS: Math.round(t) });
    await processEncounter(user, enc.id, { engine: "local" });
    for (const o of orders.list(enc.id)) if (o.status === "staged") orders.setStatus(enc.id, o.id, o.alerts.some((x) => x.level === "block") ? "rejected" : "accepted");
    const rec = notes.latest(enc.id)!;
    if (a.edit) saveNoteEdits(user, enc.id, editNote(rec.content));
    signEncounter(user, enc.id, { force: true });
    const signedAt = a.late ? new Date(start.getTime()).setHours(21, 40 + (a.daysAgo % 15), 0, 0) : ended.getTime() + (4 + (a.daysAgo % 7) * 3) * 60000;
    const iso = new Date(signedAt).toISOString();
    run("UPDATE encounters SET signed_at = ? WHERE id = ?", iso, enc.id);
    run("UPDATE audit SET created_at = ? WHERE encounter_id = ? AND action = 'note.signed'", iso, enc.id);
    run("UPDATE audit SET created_at = ? WHERE encounter_id = ? AND action != 'note.signed'", ended.toISOString(), enc.id);
  }
}

export async function seedDemo(user: User, opts: { archive?: boolean } = {}) {
  seedSchedule(user);
  if (opts.archive !== false) await seedArchive(user);
}
