"use client";

import { useState } from "react";
import { api, copyText } from "@/lib/client";
import { overlap } from "@/lib/engine/text";
import type { Note, NoteSection, NoteSentence, OmissionFlag } from "@/lib/types";
import { Alert, Check, Copy, Pencil, Shield, ThumbDown, ThumbUp, X } from "../icons";
import { Spinner } from "../ui";

function sentenceClass(s: NoteSentence, active: boolean) {
  const base = "cursor-pointer rounded-[3px] transition-colors decoration-2 underline-offset-4";
  if (active) return `${base} bg-evidence-strong`;
  if (s.kind === "carried") return `${base} text-ink-2 hover:bg-sunken`;
  if (s.kind === "clinician" || s.kind === "system") return `${base} hover:bg-sunken`;
  if (s.support === "none") return `${base} underline decoration-wavy decoration-rec hover:bg-rec-50`;
  if (s.support === "partial") return `${base} underline decoration-dotted decoration-warn hover:bg-warn-50`;
  return `${base} hover:bg-evidence`;
}

function sectionToText(sec: NoteSection) {
  return sec.sentences.filter((s) => !s.pending).map((s) => `${s.indent ? "- " : ""}${s.text}`).join("\n");
}

function textToSentences(text: string, prev: NoteSentence[], key: string): NoteSentence[] {
  const used = new Set<string>();
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const indent = /^[-•*]\s+/.test(line) ? 1 : 0;
      const body = line.replace(/^[-•*]\s+/, "");
      const exact = prev.find((p) => !used.has(p.id) && p.text === body);
      if (exact) {
        used.add(exact.id);
        return { ...exact, indent: indent || undefined };
      }
      const near = prev.filter((p) => !used.has(p.id)).map((p) => ({ p, o: overlap(body, p.text) })).sort((a, b) => b.o - a.o)[0];
      if (near && near.o >= 0.55) {
        used.add(near.p.id);
        return { ...near.p, text: body, edited: true, indent: indent || undefined };
      }
      return { id: `${key}_e${Date.now()}_${i}`, text: body, evidence: [], kind: "clinician" as const, support: "strong" as const, edited: true, indent: indent || undefined, heading: /^\d+\.\s/.test(body) || undefined };
    });
}

export default function NoteEditor({
  encounterId,
  note,
  omissions,
  locked,
  activeSentence,
  onSelect,
  onSaved,
  feedback,
}: {
  encounterId: string;
  note: Note;
  omissions: OmissionFlag[];
  locked: boolean;
  activeSentence: string | null;
  onSelect: (s: NoteSentence | null) => void;
  onSaved: (n: Note, omissions?: OmissionFlag[]) => void;
  feedback: { section: string; rating: number }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [rated, setRated] = useState<Record<string, number>>(() => Object.fromEntries(feedback.map((f) => [f.section, f.rating])));
  const [copied, setCopied] = useState<string | null>(null);

  async function save(next: Note, reason: string) {
    setBusy(true);
    try {
      const r = await api<{ note: Note; omissions: OmissionFlag[] }>(`/encounters/${encounterId}/note`, { method: "PUT", body: { note: next, reason } });
      onSaved(r.note, r.omissions);
    } finally {
      setBusy(false);
    }
  }

  function patchSection(key: string, fn: (s: NoteSentence[]) => NoteSentence[]) {
    return { ...note, sections: note.sections.map((s) => (s.key === key ? { ...s, sentences: fn(s.sentences) } : s)) };
  }

  const visible = note.sections.filter((s) => s.key !== "__consent");
  const consent = note.sections.find((s) => s.key === "__consent");
  const all = visible.flatMap((s) => s.sentences.filter((x) => !x.pending && !x.heading));
  const strong = all.filter((s) => s.support === "strong").length;
  const weak = all.filter((s) => s.support !== "strong").length;
  const pending = visible.flatMap((s) => s.sentences.filter((x) => x.pending));
  const openFlags = omissions.filter((o) => !dismissed.has(o.id));
  const pct = all.length ? Math.round((strong / all.length) * 100) : 100;

  return (
    <div className="space-y-4" data-testid="note-editor">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm" data-testid="trust-bar">
        <Shield className="text-brand" size={17} />
        <span className="font-medium" data-testid="evidence-pct">{pct}% linked to the visit</span>
        <span className="text-ink-4">·</span>
        <span className={weak ? "text-warn" : "text-ink-3"}>{weak} sentence{weak === 1 ? "" : "s"} to verify</span>
        <span className="text-ink-4">·</span>
        <span className={openFlags.length ? "text-warn" : "text-ink-3"} data-testid="omission-count">{openFlags.length} possible omission{openFlags.length === 1 ? "" : "s"}</span>
        {pending.length > 0 && (<><span className="text-ink-4">·</span><span className="text-default-ins-line">{pending.length} suggested normal finding{pending.length === 1 ? "" : "s"}</span></>)}
        <span className="ml-auto text-xs text-ink-3">{note.meta.engine === "claude" ? `Drafted by ${note.meta.model}` : "Drafted by the on-device engine"}</span>
      </div>

      {note.meta.warnings?.map((w) => <p key={w} className="rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{w}</p>)}

      {openFlags.length > 0 && !locked && (
        <div className="rounded-xl border border-warn/30 bg-warn-50/60 p-3" data-testid="omissions">
          <p className="flex items-center gap-1.5 px-1 text-sm font-semibold text-warn"><Alert size={15} /> Said in the visit, missing from the note</p>
          <ul className="mt-2 space-y-1.5">
            {openFlags.map((o) => (
              <li key={o.id} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm" data-testid="omission">
                <span className="pill bg-warn-50 text-[10px] uppercase text-warn">{o.category}</span>
                <span className="flex-1">{o.text}</span>
                <button className="text-xs font-medium text-brand hover:underline" onClick={() => onSelect({ id: o.id, text: o.suggestion, evidence: o.evidence, kind: "fact", support: "strong" })}>Source</button>
                <button
                  className="btn-outline px-2 py-1 text-xs"
                  disabled={busy}
                  onClick={() => {
                    const target = note.sections.some((s) => s.key === o.section) ? o.section : visible[visible.length - 1].key;
                    save(patchSection(target, (xs) => [...xs, { id: `${target}_om_${o.id}_${Date.now()}`, text: o.suggestion, evidence: o.evidence, kind: "fact", support: "strong", indent: /ap|plan|assessment/.test(target) ? 1 : undefined }]), "omission.added");
                  }}
                  data-testid="add-omission"
                >
                  Add to note
                </button>
                <button className="text-ink-4 hover:text-ink" onClick={() => setDismissed((d) => new Set(d).add(o.id))} aria-label="Dismiss"><X size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.map((sec) => {
        const words = sec.sentences.filter((s) => !s.pending).reduce((n, s) => n + s.text.split(/\s+/).length, 0);
        const isEditing = editing === sec.key;
        return (
          <section key={sec.key} className="card group" data-testid={`section-${sec.key}`}>
            <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{sec.title}</h3>
              <span className="text-xs text-ink-4">{words} words</span>
              <div className="ml-auto flex items-center gap-0.5">
                {!locked && !isEditing && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(sec.key); setDraft(sectionToText(sec)); }} data-testid="edit-section"><Pencil size={14} /> Edit</button>
                )}
                <button className="btn-ghost px-2 py-1" title="Copy section" aria-label={`Copy ${sec.title}`} onClick={async () => { await copyText(`${sec.title}\n${sectionToText(sec)}`); setCopied(sec.key); setTimeout(() => setCopied(null), 1500); }}>
                  {copied === sec.key ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                </button>
                {[1, -1].map((r) => (
                  <button
                    key={r}
                    className={`btn-ghost px-2 py-1 ${rated[sec.key] === r ? (r > 0 ? "text-ok" : "text-rec") : ""}`}
                    aria-label={r > 0 ? "Good section" : "Needs work"}
                    aria-pressed={rated[sec.key] === r}
                    onClick={async () => { setRated((x) => ({ ...x, [sec.key]: r })); await api(`/encounters/${encounterId}/feedback`, { body: { section: sec.key, rating: r } }); }}
                  >
                    {r > 0 ? <ThumbUp size={14} /> : <ThumbDown size={14} />}
                  </button>
                ))}
              </div>
            </header>
            <div className="px-4 py-3 text-[15px] leading-7">
              {isEditing ? (
                <div className="space-y-2">
                  <textarea className="input min-h-[180px] font-sans text-sm leading-6" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit ${sec.title}`} data-testid="section-textarea" />
                  <p className="text-xs text-ink-3">One sentence per line. Start a line with &ldquo;- &rdquo; to indent it under a problem. Unchanged lines keep their evidence links.</p>
                  <div className="flex justify-end gap-2">
                    <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-primary" disabled={busy} onClick={async () => { await save(patchSection(sec.key, (xs) => [...textToSentences(draft, xs.filter((x) => !x.pending), sec.key), ...xs.filter((x) => x.pending)]), "section.edited"); setEditing(null); }} data-testid="save-section">{busy && <Spinner />} Save</button>
                  </div>
                </div>
              ) : sec.sentences.length === 0 ? (
                <p className="text-sm italic text-ink-4">Nothing documented for this section.</p>
              ) : sec.format === "paragraph" ? (
                <p>
                  {sec.sentences.filter((s) => !s.pending).map((s) => (
                    <span key={s.id}>
                      <span className={sentenceClass(s, activeSentence === s.id)} onClick={() => onSelect(activeSentence === s.id ? null : s)} data-sid={s.id} data-support={s.support} data-kind={s.kind}>{s.text}</span>
                      {s.kind === "carried" && <sup className="ml-0.5 text-[9px] font-semibold uppercase text-ink-4">chart</sup>}{" "}
                    </span>
                  ))}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {sec.sentences.filter((s) => !s.pending).map((s) => (
                    <li key={s.id} className={`${s.indent ? "ml-5 list-disc marker:text-ink-4" : s.heading ? "mt-2 font-medium first:mt-0" : ""}`}>
                      <span className={sentenceClass(s, activeSentence === s.id)} onClick={() => onSelect(activeSentence === s.id ? null : s)} data-sid={s.id} data-support={s.support} data-kind={s.kind}>{s.text}</span>
                      {s.kind === "carried" && <sup className="ml-0.5 text-[9px] font-semibold uppercase text-ink-4">chart</sup>}
                    </li>
                  ))}
                </ul>
              )}
              {!isEditing && sec.sentences.some((s) => s.pending) && !locked && (
                <div className="mt-3 space-y-1.5" data-testid="pending-defaults">
                  {sec.sentences.filter((s) => s.pending).map((s) => (
                    <div key={s.id} className="flex items-start gap-2 rounded-lg border-l-2 border-default-ins-line bg-default-ins px-3 py-1.5 text-sm">
                      <span className="flex-1"><span className="mr-1.5 text-[10px] font-semibold uppercase text-default-ins-line">Not examined · template</span>{s.text}</span>
                      <button className="text-ok hover:opacity-70" aria-label="Accept normal finding" title="I examined this and it was normal" onClick={() => save(patchSection(sec.key, (xs) => xs.map((x) => (x.id === s.id ? { ...x, pending: false, kind: "clinician", support: "strong" } : x))), "default.accepted")} data-testid="accept-default"><Check size={16} /></button>
                      <button className="text-ink-4 hover:text-rec" aria-label="Remove suggestion" onClick={() => save(patchSection(sec.key, (xs) => xs.filter((x) => x.id !== s.id)), "default.removed")}><X size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {consent && (
        <div className="rounded-xl border border-ok/30 bg-ok-50 px-4 py-3 text-sm text-ok" data-testid="consent-line">
          <p className="text-[11px] font-semibold uppercase tracking-wide">Documentation consent · recorded by system</p>
          <p className="mt-1 text-ink-2">{consent.sentences[0]?.text}</p>
        </div>
      )}
    </div>
  );
}
