import { buildAgenda, markAddressed } from "../engine/agenda";
import type { IntakeSummary } from "../engine/intake";
import type { MeasureResult } from "../engine/quality";
import { ageFrom } from "../engine/text";
import type { Encounter } from "../types";
import { tasks } from "./inbox";
import { Invalid } from "./policy";
import { qualityFor } from "./quality";
import { evidenceSuspects } from "./riskAdjust";
import { artifacts, audit, encounters, patients, utterances, type User } from "./repo";

export async function agendaFor(u: User, enc: Encounter, quality?: MeasureResult[]) {
  if (!enc.patientId) return [];
  const p = await patients.get(u, enc.patientId);
  if (!p) return [];
  const prior = (await encounters.list(u, { patientId: p.id })).filter((e) => e.id !== enc.id && e.status === "signed").length;
  const intake = await artifacts.get<{ summary?: IntakeSummary }>(enc.id, "intake");
  const q = quality ?? ((await artifacts.get<MeasureResult[]>(enc.id, "quality")) ?? (await qualityFor(u, enc, { save: false })) ?? []);
  const open = (await tasks.forPatient(u, p.id)).filter((t) => t.encounterId !== enc.id).map((t) => ({ kind: t.kind, title: t.title, dueAt: t.dueAt }));
  const items = buildAgenda({ chart: p.chart, newPatient: enc.visitType === "new" || (!p.chart.priorVisits?.length && !prior), intakeFlags: intake?.summary?.flags, quality: q, openTasks: open, suspects: evidenceSuspects(p.chart, ageFrom(p.dob), p.sex), at: new Date(enc.scheduledAt) });
  const done = (await artifacts.get<string[]>(enc.id, "agenda_done")) ?? [];
  const said = (await utterances.list(enc.id)).map((x) => x.text).join(" ");
  return markAddressed(items, said, done);
}

export async function toggleAgenda(u: User, encId: string, key: string, done: boolean) {
  const enc = await encounters.get(u, encId);
  if (!enc) throw new Error("Encounter not found");
  if (!key || key.length > 300) throw new Invalid("Unknown agenda item");
  const cur = (await artifacts.get<string[]>(encId, "agenda_done")) ?? [];
  const next = done ? Array.from(new Set([...cur, key])) : cur.filter((k) => k !== key);
  await artifacts.set(encId, "agenda_done", next);
  await audit.log(u, encId, done ? "agenda.checked" : "agenda.unchecked", { key });
  return next;
}
