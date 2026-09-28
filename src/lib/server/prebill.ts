import { get, now, run } from "../db";
import type { Snapshot } from "../engine/inpatient";
import { prebillReview, type StayDay } from "../engine/prebill";
import type { CodingResult } from "../types";
import { admissions, hospitalDay } from "./inpatient";
import { Forbidden, Invalid } from "./policy";
import { addAddendum } from "./signoff";
import { artifacts, audit, encounters, j, type User } from "./repo";

interface Answer {
  option: string;
  by: string;
  at: string;
  addendum: boolean;
}

const NON_DX = /^(?:Other|Clinically undetermined|Not clinically supported|Expected variation|Dilutional change|Hypoxemia without|Localized infection without|SIRS of non-infectious|Chronic, type as documented)/i;

async function stay(u: User, admissionId: string) {
  const adm = await admissions.get(u, admissionId);
  if (!adm) throw new Error("Admission not found");
  const encs = (await encounters.list(u, { admissionId })).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const days: StayDay[] = [];
  for (const e of encs) {
    const coding = await artifacts.get<CodingResult>(e.id, "coding");
    days.push({ day: hospitalDay(adm, e.scheduledAt), kind: e.visitType === "inpatient" ? "admission" : e.visitType === "discharge" ? "discharge" : "progress", snapshot: (await artifacts.get<Snapshot>(e.id, "snapshot")) ?? null, problems: (coding?.diagnoses ?? []).map((d) => ({ icd10: d.code, label: d.label })) });
  }
  return { adm, encs, days };
}

export async function prebillFor(u: User, admissionId: string) {
  const { days } = await stay(u, admissionId);
  const answers = j<Record<string, Answer>>((await get<{ cdi: string }>("SELECT cdi FROM admissions WHERE id = ? AND org_id = ?", admissionId, u.orgId))?.cdi, {});
  const r = prebillReview(days);
  return { queries: r.queries.map((q) => ({ ...q, answer: answers[q.key] ?? null })), poa: r.poa, open: r.queries.filter((q) => !answers[q.key]).length };
}

export async function answerQuery(u: User, admissionId: string, key: string, option: string) {
  const { adm, encs } = await stay(u, admissionId);
  if (u.id !== adm.attendingId) throw new Forbidden("Only the attending physician can answer documentation queries");
  const review = await prebillFor(u, admissionId);
  const q = review.queries.find((x) => x.key === key);
  if (!q) throw new Invalid("That query no longer applies");
  if (!q.options.includes(option)) throw new Invalid("Choose one of the listed options");
  let addendum = false;
  if (!NON_DX.test(option)) {
    const target = [...encs].reverse().find((e) => e.status === "signed" && e.userId === u.id);
    if (target) {
      await addAddendum(u, target.id, { kind: "addendum", reason: "Response to a documentation query", text: `Clarification: ${option}. Clinical indicators reviewed: ${q.indicators.join("; ")}.` });
      addendum = true;
    }
  }
  const cur = j<Record<string, Answer>>((await get<{ cdi: string }>("SELECT cdi FROM admissions WHERE id = ?", admissionId))?.cdi, {});
  await run("UPDATE admissions SET cdi = ? WHERE id = ?", JSON.stringify({ ...cur, [key]: { option, by: u.name, at: now(), addendum } }), admissionId);
  await audit.log(u, encs.at(-1)?.id ?? null, "cdi.query_answered", { admissionId, key, option, addendum });
  return prebillFor(u, admissionId);
}
