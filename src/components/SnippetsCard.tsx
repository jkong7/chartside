"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Snippet } from "@/lib/engine/snippets";
import type { VocabEntry } from "@/lib/server/snippets";
import { Pencil, Plus, X } from "./icons";
import { Spinner } from "./ui";

export default function SnippetsCard({ isAdmin }: { isAdmin: boolean }) {
  const [list, setList] = useState<Snippet[] | null>(null);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [edit, setEdit] = useState<Partial<Snippet> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [vkind, setVkind] = useState<"term" | "replace">("term");

  useEffect(() => {
    api<{ snippets: Snippet[] }>("/snippets").then((r) => setList(r.snippets));
    api<{ vocabulary: VocabEntry[] }>("/vocabulary").then((r) => setVocab(r.vocabulary));
  }, []);

  async function run<T>(fn: () => Promise<T>) {
    setErr(null);
    try {
      return await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  if (!list) return <div className="card flex h-24 items-center justify-center text-brand"><Spinner /></div>;
  return (
    <div className="card p-5" data-testid="snippets-card">
      <p className="text-sm font-semibold">Snippets &amp; vocabulary</p>
      <p className="mt-1 text-sm text-ink-3">Type <span className="kbd">/shortcut</span> and a space in any note section, or say &ldquo;insert&rdquo; and the snippet name while dictating. Placeholders such as <span className="kbd">{"{{patient.first}}"}</span>, <span className="kbd">{"{{meds}}"}</span>, and <span className="kbd">{"{{allergies}}"}</span> fill from the chart, and <span className="kbd">***</span> marks a blank you fill in.</p>
      <ul className="mt-3 divide-y divide-line" data-testid="snippet-list">
        {list.map((s) => (
          <li key={s.id} className="flex items-start gap-3 py-2.5 text-sm">
            <span className="kbd mt-0.5 shrink-0">/{s.trigger}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name} {s.system && <span className="pill bg-sunken text-[10px] text-ink-3">built-in</span>} {s.shared && <span className="pill bg-info-50 text-[10px] text-info">shared</span>}</p>
              <p className="truncate text-xs text-ink-3">{s.body.split("\n")[0]}</p>
            </div>
            {!s.system && (s.ownedByMe || isAdmin) && (
              <>
                <button className="btn-ghost px-1.5" aria-label={`Edit ${s.name}`} onClick={() => setEdit(s)}><Pencil size={13} /></button>
                <button className="btn-ghost px-1.5 text-rec" aria-label={`Delete ${s.name}`} onClick={() => run(async () => setList((await api<{ snippets: Snippet[] }>(`/snippets/${s.id}`, { method: "DELETE" })).snippets))}><X size={13} /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      {edit ? (
        <form className="mt-3 space-y-2 rounded-lg border border-line p-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = edit.id ? await api<{ snippets: Snippet[] }>(`/snippets/${edit.id}`, { method: "PATCH", body: edit }) : await api<{ snippets: Snippet[] }>("/snippets", { body: edit }); setList(r.snippets); setEdit(null); }); }} data-testid="snippet-form">
          <div className="flex gap-2">
            <input className="input w-40" placeholder="shortcut" value={edit.trigger ?? ""} onChange={(e) => setEdit({ ...edit, trigger: e.target.value })} aria-label="Shortcut" data-testid="snippet-trigger" />
            <input className="input flex-1" placeholder="Name, e.g. Knee exam" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Name" data-testid="snippet-name" />
          </div>
          <textarea className="input min-h-[90px] text-sm" placeholder="Snippet text" value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} aria-label="Snippet text" data-testid="snippet-body" />
          {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.shared} onChange={(e) => setEdit({ ...edit, shared: e.target.checked })} /> Share with everyone in the organization</label>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" data-testid="snippet-save">Save snippet</button></div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => setEdit({ trigger: "", name: "", body: "" })} data-testid="snippet-new"><Plus size={14} /> New snippet</button>
          <button className="btn-ghost" onClick={() => setCsv(csv === null ? "" : null)}>Import SmartPhrases (CSV)</button>
        </div>
      )}
      {csv !== null && (
        <div className="mt-3 space-y-2 rounded-lg border border-line p-3">
          <p className="text-xs text-ink-3">Columns: a shortcut or SmartPhrase name, the text, and optionally a display name. Epic tokens like @NAME@, @AGE@, and @MEDS@ become Chartside placeholders; unknown tokens become ***.</p>
          <input type="file" accept=".csv,text/csv" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
          <textarea className="input min-h-[80px] font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"shortcut,text\nkneeexam,Right knee: no effusion..."} data-testid="snippet-csv" />
          <div className="flex justify-end gap-2"><button className="btn-primary" disabled={!csv.trim()} onClick={() => run(async () => { const r = await api<{ added: number; skipped: string[]; snippets: Snippet[] }>("/snippets/import", { body: { csv } }); setList(r.snippets); setImported(`Imported ${r.added} snippet${r.added === 1 ? "" : "s"}${r.skipped.length ? `; skipped ${r.skipped.length} (${r.skipped.slice(0, 3).join("; ")})` : ""}.`); setCsv(null); })} data-testid="snippet-import">Import</button></div>
        </div>
      )}
      {imported && <p className="mt-2 text-sm text-ok" role="status">{imported}</p>}

      <div className="mt-5 border-t border-line pt-4" data-testid="vocabulary">
        <p className="text-sm font-semibold">Vocabulary</p>
        <p className="mt-1 text-sm text-ink-3">Words the speech engine should expect (drug names, colleagues, local places), and automatic replacements applied to dictation and drafted notes.</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {vocab.map((v) => (
            <li key={v.id} className="pill flex items-center gap-1 bg-sunken text-xs" data-testid="vocab-entry">
              {v.kind === "replace" ? <>{v.term} → {v.replacement}</> : v.term}
              {(v.ownedByMe || isAdmin) && <button aria-label={`Remove ${v.term}`} onClick={() => run(async () => setVocab((await api<{ vocabulary: VocabEntry[] }>(`/vocabulary/${v.id}`, { method: "DELETE" })).vocabulary))}><X size={11} /></button>}
            </li>
          ))}
          {!vocab.length && <li className="text-xs text-ink-4">Nothing added yet.</li>}
        </ul>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; run(async () => { setVocab((await api<{ vocabulary: VocabEntry[] }>("/vocabulary", { body: { kind: vkind, term: f.get("term"), replacement: f.get("replacement") } })).vocabulary); form.reset(); }); }}>
          <select className="input w-40" value={vkind} onChange={(e) => setVkind(e.target.value as "term" | "replace")} aria-label="Kind"><option value="term">Expected word</option><option value="replace">Replace</option></select>
          <input name="term" className="input w-48" placeholder={vkind === "term" ? "e.g. tirzepatide" : "Heard as, e.g. shortness of breath"} aria-label="Word" data-testid="vocab-term" />
          {vkind === "replace" && <input name="replacement" className="input w-40" placeholder="Replace with, e.g. SOB" aria-label="Replacement" data-testid="vocab-replacement" />}
          <button className="btn-outline" data-testid="vocab-add"><Plus size={14} /> Add</button>
        </form>
      </div>
      {err && <p className="mt-3 text-sm text-rec" role="alert">{err}</p>}
    </div>
  );
}
