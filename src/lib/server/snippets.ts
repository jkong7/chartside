import { all, get, now, run, uid } from "../db";
import { SYSTEM_SNIPPETS, validTrigger, type Snippet } from "../engine/snippets";
import type { Note } from "../types";
import { Forbidden, Invalid } from "./policy";
import { audit, type User } from "./repo";

interface SnippetRow {
  id: string;
  user_id: string;
  shared: number;
  trigger: string;
  name: string;
  body: string;
}

const isAdmin = (u: User) => ["owner", "admin"].includes(u.role);

export const snippets = {
  list: async (u: User): Promise<Snippet[]> => {
    const rows = await all<SnippetRow>("SELECT * FROM snippets WHERE org_id = ? AND (user_id = ? OR shared = 1) ORDER BY name", u.orgId, u.id);
    const mine = rows.map((r) => ({ id: r.id, trigger: r.trigger, name: r.name, body: r.body, shared: !!r.shared, ownedByMe: r.user_id === u.id }));
    const taken = new Set(mine.map((m) => m.trigger));
    return [...mine, ...SYSTEM_SNIPPETS.filter((s) => !taken.has(s.trigger))];
  },
  save: async (u: User, input: { id?: string; trigger?: string; name?: string; body?: string; shared?: boolean }) => {
    const trigger = (input.trigger ?? "").trim().toLowerCase().replace(/^\//, "");
    const name = (input.name ?? "").trim();
    const body = (input.body ?? "").trim();
    if (!validTrigger(trigger)) throw new Invalid("Shortcuts are 2 to 24 lowercase letters, numbers, or dashes");
    if (!name) throw new Invalid("Give the snippet a name");
    if (!body || body.length > 4000) throw new Invalid("Snippet text must be 1 to 4,000 characters");
    if (input.shared && !isAdmin(u)) throw new Forbidden("Only admins can share snippets with the organization");
    if (input.id) {
      const cur = await get<SnippetRow>("SELECT * FROM snippets WHERE org_id = ? AND id = ?", u.orgId, input.id);
      if (!cur) throw new Error("Snippet not found");
      if (cur.user_id !== u.id && !isAdmin(u)) throw new Forbidden("Only the author or an admin can change this snippet");
      await run("UPDATE snippets SET trigger = ?, name = ?, body = ?, shared = ? WHERE id = ?", trigger, name, body, input.shared === undefined ? cur.shared : input.shared ? 1 : 0, input.id);
      await audit.log(u, null, "snippet.updated", { id: input.id, trigger });
      return input.id;
    }
    const clash = await get<{ id: string }>("SELECT id FROM snippets WHERE org_id = ? AND trigger = ? AND (user_id = ? OR shared = 1)", u.orgId, trigger, u.id);
    if (clash) throw new Invalid(`You already have a snippet with the shortcut /${trigger}`);
    const id = uid("snp_");
    await run("INSERT INTO snippets (id, org_id, user_id, shared, trigger, name, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, u.id, input.shared ? 1 : 0, trigger, name, body, now());
    await audit.log(u, null, "snippet.created", { id, trigger, shared: !!input.shared });
    return id;
  },
  remove: async (u: User, id: string) => {
    const cur = await get<SnippetRow>("SELECT * FROM snippets WHERE org_id = ? AND id = ?", u.orgId, id);
    if (!cur) throw new Error("Snippet not found");
    if (cur.user_id !== u.id && !isAdmin(u)) throw new Forbidden("Only the author or an admin can delete this snippet");
    await run("DELETE FROM snippets WHERE id = ?", id);
    await audit.log(u, null, "snippet.deleted", { id });
  },
  importCsv: async (u: User, csv: string) => {
    const rows = parseCsv(csv);
    const header = rows.shift()?.map((h) => h.toLowerCase().trim()) ?? [];
    const ti = header.findIndex((h) => /trigger|shortcut|abbreviation|smartphrase|name/.test(h) && !/display/.test(h));
    const bi = header.findIndex((h) => /body|text|content|expansion/.test(h));
    const ni = header.findIndex((h) => /display|description|title/.test(h));
    if (ti < 0 || bi < 0) throw new Invalid("The CSV needs a shortcut column and a text column");
    let added = 0;
    const skipped: string[] = [];
    for (const r of rows) {
      const trigger = (r[ti] ?? "").trim().toLowerCase().replace(/^[./]/, "").replace(/[^a-z0-9-]+/g, "-").slice(0, 24);
      try {
        await snippets.save(u, { trigger, name: (ni >= 0 ? r[ni] : "") || trigger, body: (r[bi] ?? "").replace(/@([A-Z]+)@/g, (_, k: string) => ({ NAME: "{{patient.name}}", FNAME: "{{patient.first}}", AGE: "{{patient.age}}", SEX: "{{patient.sex}}", MEDS: "{{meds}}", ALLERGY: "{{allergies}}", PROB: "{{problems}}", TODAY: "{{today}}", ME: "{{clinician}}" })[k] ?? "***") });
        added++;
      } catch (err) {
        skipped.push(`${trigger || "(blank)"}: ${err instanceof Error ? err.message : "invalid"}`);
      }
    }
    return { added, skipped };
  },
};

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export interface VocabEntry {
  id: string;
  kind: "term" | "replace";
  term: string;
  replacement: string;
  shared: boolean;
  ownedByMe: boolean;
}

export const vocabulary = {
  list: async (u: User): Promise<VocabEntry[]> =>
    (await all<{ id: string; user_id: string; kind: string; term: string; replacement: string; shared: number }>("SELECT * FROM vocabulary WHERE org_id = ? AND (user_id = ? OR shared = 1) ORDER BY kind, term", u.orgId, u.id)).map((r) => ({ id: r.id, kind: r.kind as VocabEntry["kind"], term: r.term, replacement: r.replacement, shared: !!r.shared, ownedByMe: r.user_id === u.id })),
  add: async (u: User, input: { kind?: string; term?: string; replacement?: string; shared?: boolean }) => {
    const kind = input.kind === "replace" ? "replace" : "term";
    const term = (input.term ?? "").trim();
    const replacement = (input.replacement ?? "").trim();
    if (!term || term.length > 60) throw new Invalid("Enter a word or phrase up to 60 characters");
    if (kind === "replace" && !replacement) throw new Invalid("Enter what to replace it with");
    if (input.shared && !isAdmin(u)) throw new Forbidden("Only admins can share vocabulary with the organization");
    const id = uid("voc_");
    await run("INSERT INTO vocabulary (id, org_id, user_id, shared, kind, term, replacement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, u.id, input.shared ? 1 : 0, kind, term, replacement, now());
    return id;
  },
  remove: async (u: User, id: string) => {
    const cur = await get<{ user_id: string }>("SELECT user_id FROM vocabulary WHERE org_id = ? AND id = ?", u.orgId, id);
    if (!cur) throw new Error("Entry not found");
    if (cur.user_id !== u.id && !isAdmin(u)) throw new Forbidden("Only the author or an admin can remove this entry");
    await run("DELETE FROM vocabulary WHERE id = ?", id);
  },
  replacements: async (userId: string, orgId: string | null) =>
    (await all<{ term: string; replacement: string }>("SELECT term, replacement FROM vocabulary WHERE org_id = ? AND kind = 'replace' AND (user_id = ? OR shared = 1)", orgId ?? "", userId)).map((r) => ({ from: r.term, to: r.replacement })),
  keyterms: async (u: User) => (await all<{ term: string }>("SELECT term FROM vocabulary WHERE org_id = ? AND (user_id = ? OR shared = 1)", u.orgId, u.id)).map((r) => r.term).slice(0, 100),
};

export function applyReplacements(note: Note, reps: { from: string; to: string }[]): Note {
  if (!reps.length) return note;
  const res = reps.map((r) => ({ re: new RegExp(`\\b${r.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), to: r.to }));
  return {
    ...note,
    sections: note.sections.map((s) => ({ ...s, sentences: s.sentences.map((x) => {
      let text = x.text;
      for (const r of res) text = text.replace(r.re, r.to);
      return text === x.text ? x : { ...x, text };
    }) })),
  };
}
