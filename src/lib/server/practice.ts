import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { generateNoteWithClaude, llmEnabled, playPatientWithClaude } from "../llm";
import { gradePimp, gradePresentation, type PimpResult, type PresentationGrade } from "../engine/practice/attending";
import { practiceCase } from "../engine/practice/cases";
import { scorecard, type Scorecard } from "../engine/practice/grade";
import { endCommand } from "../engine/practice/intent";
import { respond, studentTopics } from "../engine/practice/patient";
import { practicePatient, practiceUtterances, referenceNote } from "../engine/practice/reference";
import type { PracticeCase, Turn } from "../engine/practice/types";
import { noteToText } from "../engine/note";
import { systemTemplate } from "../engine/templates";
import { limited } from "./ratelimit";
import { Forbidden, Invalid } from "./policy";
import { audit, users } from "./repo";

export const PRACTICE_COOKIE = "cs_prac";
export const DEFAULT_MINUTES = 12;
export const MAX_TURNS = 160;

export type PracticeStatus = "active" | "noting" | "graded";

export interface Presentation {
  text: string;
  seconds: number;
  grade: PresentationGrade;
  pimp: PimpResult[] | null;
  at: string;
}

export interface PracticeSession {
  id: string;
  caseId: string;
  device: string | null;
  userId: string | null;
  name: string;
  cohort: string | null;
  channel: "web" | "voice" | "phone";
  status: PracticeStatus;
  turns: Turn[];
  note: string | null;
  reference: { text: string; engine: string; score: number } | null;
  grade: Scorecard | null;
  presentation: Presentation | null;
  challengeOf: string | null;
  timeLimitS: number;
  student: boolean;
  engine: "local" | "claude";
  score: number | null;
  startedAt: string;
  endedAt: string | null;
  gradedAt: string | null;
}

interface Row {
  id: string;
  case_id: string;
  device: string | null;
  user_id: string | null;
  name: string;
  cohort: string | null;
  channel: string;
  status: string;
  turns: string;
  note: string | null;
  reference: string | null;
  grade: string | null;
  presentation: string | null;
  challenge_of: string | null;
  claim_hash: string | null;
  claim_expires_at: string | null;
  time_limit_s: number;
  student: number;
  engine: string;
  score: number | null;
  started_at: string;
  ended_at: string | null;
  graded_at: string | null;
}

const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const toSession = (r: Row): PracticeSession => ({
  id: r.id,
  caseId: r.case_id,
  device: r.device,
  userId: r.user_id,
  name: r.name,
  cohort: r.cohort,
  channel: r.channel as PracticeSession["channel"],
  status: r.status as PracticeStatus,
  turns: parse<Turn[]>(r.turns, []),
  note: r.note,
  reference: parse(r.reference, null),
  grade: parse(r.grade, null),
  presentation: parse(r.presentation, null),
  challengeOf: r.challenge_of,
  timeLimitS: Number(r.time_limit_s),
  student: !!Number(r.student),
  engine: r.engine === "claude" ? "claude" : "local",
  score: r.score === null ? null : Number(r.score),
  startedAt: r.started_at,
  endedAt: r.ended_at,
  gradedAt: r.graded_at,
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function patientVoice(c: PracticeCase) {
  const female = c.patient.speaker ? /mother|mom|aunt|grandmother/.test(c.patient.speaker.relation) : c.patient.sex === "F";
  return female ? process.env.CHARTSIDE_PRACTICE_VOICE_F || "aura-2-luna-en" : process.env.CHARTSIDE_PRACTICE_VOICE_M || "aura-2-arcas-en";
}

export function newDevice() {
  return randomBytes(18).toString("base64url");
}

export function validDevice(v: string | null | undefined) {
  return !!v && /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : null;
}

export function cleanName(v: unknown) {
  const first = String(v ?? "").trim().split(/\s+/)[0] ?? "";
  const letters = first.normalize("NFKC").replace(/[^\p{L}'-]/gu, "").slice(0, 20);
  return letters ? letters[0].toUpperCase() + letters.slice(1) : "";
}

export function cleanCohort(v: unknown) {
  const s = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!s) return null;
  if (!/^[A-Z0-9-]{3,24}$/.test(s)) throw new Invalid("Class codes use 3 to 24 letters, numbers or dashes");
  return s;
}

export function isStudentEmail(email: string | null | undefined) {
  return !!email && /@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$/i.test(email.trim());
}

export interface Actor {
  device: string | null;
  userId: string | null;
}

export function owns(s: PracticeSession, a: Actor) {
  if (s.userId) return !!a.userId && s.userId === a.userId;
  return !!a.device && s.device === a.device;
}

export function envCount(name: string, fallback: number) {
  const raw = process.env[name];
  const v = Number(raw);
  return raw && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export async function spendSession(id: string, column: "speech_tokens" | "voice_clips" | "llm_calls", max: number) {
  if (!(max > 0)) return false;
  return (await run(`UPDATE practice_sessions SET ${column} = ${column} + 1 WHERE id = ? AND ${column} < ?`, id, max)).changes > 0;
}

export function claimHours() {
  return envCount("CHARTSIDE_PRACTICE_LINK_HOURS", 24);
}

export async function getPractice(id: string) {
  if (!/^prs_[a-z0-9]{8,40}$/i.test(id ?? "")) return null;
  const r = await get<Row>("SELECT * FROM practice_sessions WHERE id = ?", id);
  return r ? toSession(r) : null;
}

async function mine(id: string, a: Actor) {
  const s = await getPractice(id);
  if (!s) throw new Error("Practice session not found");
  if (!owns(s, a)) throw new Forbidden("This practice session belongs to someone else. Start your own from the case list.");
  return s;
}

export function elapsed(s: PracticeSession, at = Date.now()) {
  return Math.max(0, Math.round((at - Date.parse(s.startedAt)) / 1000));
}

export async function startPractice(input: { caseId: string; actor: Actor; name?: unknown; cohort?: unknown; minutes?: unknown; challengeOf?: string | null; channel?: PracticeSession["channel"]; claimToken?: string | null }) {
  const c = practiceCase(input.caseId);
  if (!c) throw new Invalid("Pick a case from the list");
  const minutes = Math.min(30, Math.max(3, Math.round(Number(input.minutes) || DEFAULT_MINUTES)));
  const challenger = input.challengeOf ? await getPractice(input.challengeOf) : null;
  const user = input.actor.userId ? await users.byId(input.actor.userId) : null;
  const id = uid("prs_");
  const ts = now();
  await run(
    "INSERT INTO practice_sessions (id, case_id, device, user_id, name, cohort, channel, status, turns, challenge_of, claim_hash, claim_expires_at, time_limit_s, student, engine, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '[]', ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    c.id,
    input.actor.device,
    input.actor.userId,
    cleanName(input.name) || (user && !user.email.endsWith(".invalid") ? cleanName(user.name) : ""),
    cleanCohort(input.cohort),
    input.channel ?? "web",
    challenger && challenger.caseId === c.id ? challenger.id : null,
    input.claimToken ? sha(input.claimToken) : null,
    input.claimToken ? new Date(Date.now() + claimHours() * 3600_000).toISOString() : null,
    minutes * 60,
    isStudentEmail(user?.email) ? 1 : 0,
    llmEnabled() ? "claude" : "local",
    ts,
    ts,
  );
  await audit.log(null, null, "practice.started", { id, caseId: c.id, channel: input.channel ?? "web" });
  return (await getPractice(id))!;
}

async function save(s: PracticeSession, fields: Partial<Record<"turns" | "status" | "note" | "reference" | "grade" | "presentation" | "ended_at" | "graded_at" | "score" | "engine", string | number | null>>) {
  const keys = Object.keys(fields);
  await run(`UPDATE practice_sessions SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => fields[k as keyof typeof fields] ?? null), s.id);
}

function persona(c: PracticeCase) {
  const p = c.patient;
  const who = p.speaker ? `You are ${p.speaker.name}, the ${p.speaker.relation} of ${p.name}, age ${p.age === 1 ? "18 months" : p.age}. You answer for your child.` : `You are ${p.name}, age ${p.age}.`;
  return `${who} Setting: ${c.door.setting}. How you come across: ${p.affect}\nIf asked an open question about why you came, say: "${p.opening}" If asked to say more, say: "${p.story}"`;
}

async function patientSays(c: PracticeCase, s: PracticeSession, text: string, offline: string) {
  if (s.engine !== "claude" || !llmEnabled() || limited("practice-llm:all", Number(process.env.CHARTSIDE_PRACTICE_LLM_DAILY || 3000), 86400_000)) return { text: offline, engine: "local" as const };
  try {
    const history = s.turns.filter((t) => t.role === "student" || t.role === "patient").map((t) => ({ role: t.role as "student" | "patient", text: t.text }));
    return { text: await playPatientWithClaude({ persona: persona(c), facts: c.facts, history, question: text }), engine: "claude" as const };
  } catch {
    return { text: offline, engine: "local" as const };
  }
}

export interface TurnResult {
  session: PracticeSession;
  added: Turn[];
  ended: boolean;
}

function nextId(turns: Turn[]) {
  return `t${turns.length + 1}`;
}

export async function askPatient(id: string, a: Actor, input: { text?: string; exam?: string }): Promise<TurnResult> {
  const s = await mine(id, a);
  if (s.status !== "active") throw new Invalid("This encounter has ended. Write your note next.");
  const c = practiceCase(s.caseId)!;
  const t = elapsed(s);
  if (t > s.timeLimitS + 30) {
    const done = await endPractice(id, a);
    return { session: done, added: [], ended: true };
  }
  if (s.turns.length >= MAX_TURNS) throw new Invalid("That's the most questions one encounter can hold. End the encounter to see your score.");
  const text = String(input.text ?? "").trim().slice(0, 500);
  if (input.exam) {
    const e = c.exam.find((x) => x.key === input.exam);
    if (!e) throw new Invalid("Unknown exam");
    const added: Turn[] = [];
    const turns = [...s.turns];
    const push = (turn: Omit<Turn, "id">) => {
      const full = { id: nextId(turns), ...turn } as Turn;
      turns.push(full);
      added.push(full);
    };
    push({ role: "student", text: e.ask, t, topics: [] });
    push({ role: "exam", text: e.finding, t, exam: e.key });
    await save(s, { turns: JSON.stringify(turns) });
    return { session: { ...s, turns }, added, ended: false };
  }
  if (!text) throw new Invalid("Ask the patient something");
  if (endCommand(text)) return { session: await endPractice(id, a), added: [], ended: true };
  const offline = respond(c, text, s.turns);
  const turns = [...s.turns];
  const added: Turn[] = [];
  const push = (turn: Omit<Turn, "id">) => {
    const full = { id: nextId(turns), ...turn } as Turn;
    turns.push(full);
    added.push(full);
  };
  push({ role: "student", text, t, topics: studentTopics(c, text).topics });
  const reply = offline.exams.length ? { text: offline.text } : await patientSays(c, s, text, offline.text);
  push({ role: "patient", text: reply.text, t: elapsed(s), cue: offline.cue || undefined });
  for (const e of offline.exams) push({ role: "exam", text: e.finding, t: elapsed(s), exam: e.key });
  await save(s, { turns: JSON.stringify(turns) });
  return { session: { ...s, turns }, added, ended: false };
}

export async function endPractice(id: string, a: Actor) {
  const s = await mine(id, a);
  if (s.status !== "active") return s;
  const c = practiceCase(s.caseId)!;
  const grade = scorecard(c, s.turns, null);
  const endedAt = new Date(Math.min(Date.now(), Date.parse(s.startedAt) + (s.timeLimitS + 30) * 1000)).toISOString();
  await save(s, { status: "noting", ended_at: endedAt, grade: JSON.stringify(grade), score: grade.overall });
  await audit.log(null, null, "practice.ended", { id, turns: s.turns.length });
  return (await getPractice(id))!;
}

async function chartsideNote(c: PracticeCase, turns: Turn[]) {
  const local = referenceNote(c, turns);
  if (!llmEnabled() || limited("practice-llm:all", Number(process.env.CHARTSIDE_PRACTICE_LLM_DAILY || 3000), 86400_000)) return { text: local.text, engine: "local" };
  try {
    const note = await generateNoteWithClaude({ utterances: practiceUtterances(turns), patient: practicePatient(c), template: systemTemplate("soap")!, reason: c.title, visitType: "new", rules: [] });
    return { text: noteToText(note), engine: "claude" };
  } catch {
    return { text: local.text, engine: "local" };
  }
}

export async function submitNote(id: string, a: Actor, noteIn: unknown) {
  let s = await mine(id, a);
  if (s.status === "graded") throw new Invalid("This case is already graded. Start the case again to try another note.");
  if (s.status === "active") s = await endPractice(id, a);
  const note = String(noteIn ?? "").slice(0, 8000);
  const c = practiceCase(s.caseId)!;
  const grade = scorecard(c, s.turns, note);
  const ref = await chartsideNote(c, s.turns);
  const refScore = scorecard(c, s.turns, ref.text).note?.score ?? 0;
  const done = await run("UPDATE practice_sessions SET status = 'graded', note = ?, grade = ?, score = ?, reference = ?, graded_at = ? WHERE id = ? AND status <> 'graded'", note, JSON.stringify(grade), grade.overall, JSON.stringify({ ...ref, score: refScore }), now(), s.id);
  if (done.changes === 0) throw new Invalid("This case is already graded. Start the case again to try another note.");
  await audit.log(null, null, "practice.graded", { id, score: grade.overall, noted: !!note.trim() });
  return (await getPractice(id))!;
}

export async function presentToAttending(id: string, a: Actor, input: { text?: unknown; seconds?: unknown }) {
  const s = await mine(id, a);
  if (s.status === "active") throw new Invalid("Finish the encounter before you present");
  const text = String(input.text ?? "").trim().slice(0, 6000);
  if (text.split(/\s+/).length < 8) throw new Invalid("Present the case in a few sentences first");
  const seconds = Math.min(1800, Math.max(0, Number(input.seconds) || Math.round(text.split(/\s+/).length / 2.5)));
  const grade = gradePresentation(practiceCase(s.caseId)!, text, seconds);
  const presentation: Presentation = { text, seconds, grade, pimp: null, at: now() };
  await save(s, { presentation: JSON.stringify(presentation) });
  return { session: (await getPractice(id))!, questions: practiceCase(s.caseId)!.pimp.map((p) => p.q) };
}

export async function answerPimp(id: string, a: Actor, answersIn: unknown) {
  const s = await mine(id, a);
  if (!s.presentation) throw new Invalid("Present the case first");
  const answers = Array.isArray(answersIn) ? answersIn.slice(0, 3).map((x) => String(x ?? "").slice(0, 600)) : [];
  const pimp = gradePimp(practiceCase(s.caseId)!, answers);
  await save(s, { presentation: JSON.stringify({ ...s.presentation, pimp }) });
  return (await getPractice(id))!;
}

export async function claimPractice(a: Actor, userId: string) {
  const u = await users.byId(userId);
  if (!u) throw new Forbidden("Sign in first");
  if (!a.device) return 0;
  const student = isStudentEmail(u.email) ? 1 : 0;
  const r = await run("UPDATE practice_sessions SET user_id = ?, student = ? WHERE device = ? AND (user_id IS NULL OR user_id = ?)", u.id, student, a.device, u.id);
  const name = cleanName(u.name);
  if (name) await run("UPDATE practice_sessions SET name = ? WHERE user_id = ? AND name = ''", name, u.id);
  await audit.log({ id: u.id, orgId: null }, null, "practice.claimed", { sessions: r.changes, student: !!student });
  return r.changes;
}

export type OpenResult = { status: "opened"; session: PracticeSession } | { status: "used" | "expired" | "invalid"; session: null };

export async function openWithClaim(id: string, token: string, device: string): Promise<OpenResult> {
  const s = await getPractice(id);
  if (!s || !token) return { status: "invalid", session: null };
  const r = await get<{ claim_hash: string | null; claim_expires_at: string | null }>("SELECT claim_hash, claim_expires_at FROM practice_sessions WHERE id = ?", id);
  if (!r?.claim_hash) return s.device === device && !s.userId ? { status: "opened", session: s } : { status: s.channel === "phone" ? "used" : "invalid", session: null };
  const a = Buffer.from(sha(token));
  const b = Buffer.from(r.claim_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: "invalid", session: null };
  if (!r.claim_expires_at || r.claim_expires_at < now()) return { status: "expired", session: null };
  const bound = await run("UPDATE practice_sessions SET claim_hash = NULL, claim_expires_at = NULL, device = CASE WHEN user_id IS NULL THEN ? ELSE device END WHERE id = ? AND claim_hash = ? AND claim_expires_at > ?", device, id, r.claim_hash, now());
  if (bound.changes === 0) return { status: "used", session: null };
  await audit.log(null, null, "practice.link_opened", { id });
  return { status: "opened", session: (await getPractice(id))! };
}

export async function historyFor(a: Actor) {
  if (!a.device && !a.userId) return [];
  const rows = await all<Row>("SELECT * FROM practice_sessions WHERE ((device = ? AND user_id IS NULL) OR user_id = ?) ORDER BY created_at DESC LIMIT 30", a.device ?? "-", a.userId ?? "-");
  return rows.map(toSession);
}

export interface Board {
  code: string;
  rows: { name: string; caseId: string; caseTitle: string; score: number; student: boolean; id: string; at: string }[];
  attempts: number;
}

export async function leaderboard(codeIn: string): Promise<Board> {
  const code = cleanCohort(codeIn);
  if (!code) throw new Invalid("Enter a class code");
  const rows = await all<Row>("SELECT * FROM practice_sessions WHERE cohort = ? AND status IN ('noting', 'graded') AND score IS NOT NULL ORDER BY score DESC, graded_at ASC LIMIT 500", code);
  const best = new Map<string, Board["rows"][number]>();
  for (const r of rows) {
    const key = `${r.user_id ?? r.device ?? r.id}:${r.case_id}`;
    if (best.has(key)) continue;
    best.set(key, { name: r.name || "Anonymous", caseId: r.case_id, caseTitle: practiceCase(r.case_id)?.title ?? r.case_id, score: Number(r.score), student: !!Number(r.student), id: r.id, at: r.graded_at ?? r.ended_at ?? r.started_at });
  }
  return { code, rows: [...best.values()].sort((a, b) => b.score - a.score).slice(0, 50), attempts: rows.length };
}

export function publicCard(s: PracticeSession) {
  const c = practiceCase(s.caseId)!;
  const g = s.grade;
  return {
    id: s.id,
    caseId: c.id,
    caseTitle: c.title,
    specialty: c.specialty,
    patient: `${c.patient.name}, ${c.patient.age === 1 ? "18 months" : c.patient.age}`,
    name: s.name || null,
    student: s.student,
    cohort: s.cohort,
    status: s.status,
    overall: g?.overall ?? null,
    categories: g?.categories ?? [],
    historyHits: g?.historyHits ?? 0,
    historyTotal: g?.historyTotal ?? c.checklist.length,
    missedRedFlags: g?.missedRedFlags ?? [],
    fixes: g?.fixes ?? [],
    presentation: s.presentation ? { score: s.presentation.grade.score, pimp: s.presentation.pimp ? s.presentation.pimp.filter((p) => p.ok).length : null } : null,
    challengeOf: s.challengeOf,
    minutes: Math.round(((s.endedAt ? Date.parse(s.endedAt) : Date.now()) - Date.parse(s.startedAt)) / 60000),
  };
}
