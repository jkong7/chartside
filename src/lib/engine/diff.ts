import type { Note } from "../types";

export interface SectionDiff {
  key: string;
  title: string;
  added: string[];
  removed: string[];
}

const lines = (n: Note, key: string) => n.sections.find((s) => s.key === key)?.sentences.filter((x) => !x.pending).map((x) => x.text) ?? [];

export function diffNotes(before: Note | null, after: Note): SectionDiff[] {
  const keys = [...new Set([...(before?.sections.map((s) => s.key) ?? []), ...after.sections.map((s) => s.key)])];
  const out: SectionDiff[] = [];
  for (const key of keys) {
    const a = before ? lines(before, key) : [];
    const b = lines(after, key);
    const added = b.filter((x) => !a.includes(x));
    const removed = a.filter((x) => !b.includes(x));
    if (added.length || removed.length) out.push({ key, title: after.sections.find((s) => s.key === key)?.title ?? before?.sections.find((s) => s.key === key)?.title ?? key, added, removed });
  }
  return out;
}

export function provenance(note: Note) {
  const all = note.sections.filter((s) => !s.key.startsWith("__")).flatMap((s) => s.sentences.filter((x) => !x.pending));
  const ai = all.filter((x) => !x.edited && (x.kind === "fact" || x.kind === "default" || x.kind === "carried")).length;
  const edited = all.filter((x) => x.edited && x.evidence.length).length;
  const clinician = all.length - ai - edited;
  return { total: all.length, ai, edited, clinician };
}
