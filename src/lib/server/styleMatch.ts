import { run } from "../db";
import { noteToText } from "../engine/note";
import { applyStyle } from "../engine/style";
import { matchStyle, samplePhiProblem } from "../engine/styleMatch";
import { llmEnabled, styleRulesWithClaude } from "../llm";
import type { Note, StyleRule } from "../types";
import { saveNoteEdits } from "./pipeline";
import { Invalid } from "./policy";
import { audit, encounters, notes, styleRules, users, type User } from "./repo";

const REPLACES = new Set(["order", "heading", "format", "pronoun", "max_words", "abbreviate"]);

async function baseNote(u: User, encounterId?: string | null): Promise<{ note: Note; encounterId: string | null; signed: boolean }> {
  if (encounterId) {
    const enc = await encounters.get(u, encounterId);
    if (!enc || enc.userId !== u.id) throw new Invalid("That visit isn't yours");
    const rec = await notes.latest(enc.id);
    if (!rec) throw new Invalid("That visit has no note yet");
    return { note: rec.content, encounterId: enc.id, signed: enc.status === "signed" };
  }
  const recent = (await encounters.list(u, { clinicianId: u.id })).filter((e) => e.status === "review" || e.status === "signed").sort((a, b) => (b.endedAt ?? b.scheduledAt).localeCompare(a.endedAt ?? a.scheduledAt));
  for (const e of recent.slice(0, 5)) {
    const rec = await notes.latest(e.id);
    if (rec) return { note: rec.content, encounterId: e.id, signed: e.status === "signed" };
  }
  throw new Invalid("Record one visit first, then we can show you the before and after.");
}

async function candidates(sample: string, note: Note) {
  const m = matchStyle(sample, note);
  let rules = m.rules;
  if (llmEnabled()) {
    try {
      const extra = await styleRulesWithClaude(sample, note.sections.map((s) => ({ key: s.key, title: s.title })));
      rules = [...rules, ...extra.filter((x) => !rules.some((r) => r.kind === x.kind && r.section === x.section && r.value === x.value))];
    } catch (err) {
      console.error("style match via claude failed", err instanceof Error ? err.message : err);
    }
  }
  return { ...m, rules };
}

function checkSample(sample: string) {
  const text = String(sample ?? "").trim();
  if (text.split(/\s+/).length < 15) throw new Invalid("Paste a whole note, at least a few lines long.");
  if (text.length > 20000) throw new Invalid("That's longer than one note. Paste just one.");
  const phi = samplePhiProblem(text);
  if (phi) throw new Invalid(phi);
  return text;
}

export async function previewStyleMatch(u: User, input: { sample?: string; encounterId?: string | null }) {
  const sample = checkSample(input.sample ?? "");
  const base = await baseNote(u, input.encounterId);
  const m = await candidates(sample, base.note);
  const existing = (await styleRules.list(u.id)).filter((r) => r.active && !REPLACES.has(r.kind));
  const proposed: StyleRule[] = m.rules.map((r, i) => ({ ...r, id: `new_${i}`, source: "manual", support: 1, active: true }));
  const after = applyStyle(base.note, [...existing, ...proposed]);
  return { encounterId: base.encounterId, signed: base.signed, detail: m.detail, findings: m.findings, rules: m.rules.map((r) => ({ kind: r.kind, section: r.section, value: r.value, label: r.label })), before: noteToText(base.note), after: noteToText(after), styled: after };
}

export async function saveStyleMatch(u: User, input: { sample?: string; encounterId?: string | null; apply?: boolean }) {
  const p = await previewStyleMatch(u, input);
  const kinds = new Set(p.rules.map((r) => `${r.kind}:${r.section}`));
  for (const r of await styleRules.list(u.id)) if (REPLACES.has(r.kind) && (kinds.has(`${r.kind}:${r.section}`) || r.kind === "order")) await run("DELETE FROM style_rules WHERE id = ? AND user_id = ?", r.id, u.id);
  for (const r of p.rules) await styleRules.addManual(u.id, { kind: r.kind, section: r.section, value: r.value, label: r.label });
  await users.update(u.id, { prefs: { noteDetail: p.detail, styleMatchedAt: new Date().toISOString() } });
  let applied = false;
  if (input.apply !== false && p.encounterId && !p.signed) {
    await saveNoteEdits(u, p.encounterId, p.styled, "style match");
    applied = true;
  }
  await audit.log(u, p.encounterId, "style.matched", { rules: p.rules.length, detail: p.detail, applied });
  return { ...p, applied, saved: await styleRules.list(u.id) };
}
