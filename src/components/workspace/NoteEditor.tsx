"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkConsistency } from "@/lib/engine/consistency";
import { Dictation, type DictationStatus } from "@/lib/audio/dictation";
import { api, copyText } from "@/lib/client";
import { expandSnippet, findSnippet, type Snippet, type SnippetContext } from "@/lib/engine/snippets";
import { provenance } from "@/lib/engine/diff";
import { applyOps, parseUtterance, sectionTarget, VOICE_HELP, type VoiceOp } from "@/lib/engine/voice";
import { overlap } from "@/lib/engine/text";
import type { Note, NoteSection, NoteSentence, OmissionFlag } from "@/lib/types";
import { Alert, Check, Copy, Mic, Pencil, Shield, ThumbDown, ThumbUp, X } from "../icons";
import { Modal, Spinner } from "../ui";
import History from "./History";

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
  snippetCtx,
  templateKinds,
  onCalculators,
}: {
  encounterId: string;
  note: Note;
  omissions: OmissionFlag[];
  locked: boolean;
  activeSentence: string | null;
  onSelect: (s: NoteSentence | null) => void;
  onSaved: (n: Note, omissions?: OmissionFlag[]) => void;
  feedback: { section: string; rating: number }[];
  snippetCtx?: SnippetContext;
  templateKinds?: Record<string, string>;
  onCalculators?: () => void;
}) {
  const [editing, setEditingState] = useState<string | null>(null);
  const [draft, setDraftState] = useState("");
  const editingRef = useRef<string | null>(null);
  const draftRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const cursorRef = useRef<number | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const [dictStatus, setDictStatus] = useState<DictationStatus>("idle");
  const [dictError, setDictError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snips, setSnips] = useState<Snippet[]>([]);
  const [reps, setReps] = useState<{ from: string; to: string }[]>([]);
  const dictRef = useRef<Dictation | null>(null);
  const snipsRef = useRef<Snippet[]>([]);
  snipsRef.current = snips;
  const repsRef = useRef(reps);
  repsRef.current = reps;
  const setEditing = (k: string | null) => {
    editingRef.current = k;
    setEditingState(k);
  };
  const setDraft = (v: string) => {
    draftRef.current = v;
    setDraftState(v);
  };
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

  const saveEditing = useCallback(async () => {
    const key = editingRef.current;
    if (!key) return;
    const n = noteRef.current;
    const sec = n.sections.find((x) => x.key === key);
    if (!sec || sectionToText(sec) === draftRef.current) return;
    const next = { ...n, sections: n.sections.map((x) => (x.key === key ? { ...x, sentences: [...textToSentences(draftRef.current, x.sentences.filter((y) => !y.pending), key), ...x.sentences.filter((y) => y.pending)] } : x)) };
    const r = await api<{ note: Note; omissions: OmissionFlag[] }>(`/encounters/${encounterId}/note`, { method: "PUT", body: { note: next, reason: "section.dictated" } });
    noteRef.current = r.note;
    onSaved(r.note, r.omissions);
  }, [encounterId, onSaved]);

  const openSection = useCallback((key: string) => {
    const sec = noteRef.current.sections.find((x) => x.key === key);
    if (!sec) return;
    setEditing(key);
    setDraft(sectionToText(sec));
    historyRef.current = [];
    cursorRef.current = null;
    setTimeout(() => {
      const a = areaRef.current;
      if (a) {
        a.focus();
        a.setSelectionRange(a.value.length, a.value.length);
      }
    }, 0);
  }, []);

  const insertAtCursor = useCallback((ops: VoiceOp[] | string) => {
    const a = areaRef.current;
    const v = draftRef.current;
    const at = Math.min(v.length, cursorRef.current ?? (a && document.activeElement === a ? a.selectionStart : v.length));
    const before = v.slice(0, at);
    const after = v.slice(at);
    const res = typeof ops === "string" ? { value: before + (before && !/\s$/.test(before) ? (ops.includes("\n") ? "\n" : " ") : "") + ops, history: [] } : applyOps({ value: before, history: [] }, ops, repsRef.current);
    historyRef.current.push(v);
    const next = res.value + (after && !/^\s/.test(after) ? " " : "") + after;
    setDraft(next);
    cursorRef.current = res.value.length;
    setTimeout(() => {
      const el = areaRef.current;
      if (el && cursorRef.current !== null) el.setSelectionRange(cursorRef.current, cursorRef.current);
      cursorRef.current = null;
    }, 0);
  }, []);

  const handleVoice = useCallback(async (text: string) => {
    setHeard(text);
    const ops = parseUtterance(text);
    const secs = noteRef.current.sections.filter((x) => x.key !== "__consent");
    const textual = new Set(["text", "newline", "paragraph", "bullet"]);
    const batched: (VoiceOp | VoiceOp[])[] = [];
    for (const op of ops) {
      const last = batched.at(-1);
      if (textual.has(op.type) && Array.isArray(last)) last.push(op);
      else batched.push(textual.has(op.type) ? [op] : op);
    }
    for (const op of batched) {
      if (Array.isArray(op)) {
        insertAtCursor(op);
        continue;
      }
      if (op.type === "stop") {
        dictRef.current?.stop();
        dictRef.current = null;
      } else if (op.type === "help") setHelpOpen(true);
      else if (op.type === "save") await saveEditing();
      else if (op.type === "delete_last") {
        const prev = historyRef.current.pop();
        if (prev !== undefined) setDraft(prev);
      } else if (op.type === "clear_section") {
        historyRef.current.push(draftRef.current);
        setDraft("");
      } else if (op.type === "goto" || op.type === "next_section" || op.type === "previous_section") {
        const i = secs.findIndex((x) => x.key === editingRef.current);
        const target = op.type === "goto" ? sectionTarget(op.target, secs.map((x) => ({ key: x.key, title: x.title, kind: templateKinds?.[x.key] }))) : secs[Math.max(0, Math.min(secs.length - 1, i + (op.type === "next_section" ? 1 : -1)))]?.key;
        if (target && target !== editingRef.current) {
          await saveEditing();
          openSection(target);
        }
      } else if (op.type === "snippet") {
        const sn = findSnippet(op.name, snipsRef.current);
        if (sn) insertAtCursor(expandSnippet(sn.body, snippetCtx ?? {}));
        else setDictError(`No snippet called "${op.name}". Say "what can I say" for help.`);
      }
    }
  }, [insertAtCursor, openSection, saveEditing, snippetCtx, templateKinds]);

  const handleVoiceRef = useRef(handleVoice);
  handleVoiceRef.current = handleVoice;

  useEffect(() => () => dictRef.current?.stop(), []);

  async function loadSpeech() {
    const cfg = await api<{ provider: "deepgram" | "browser"; url: string | null; snippets: Snippet[]; replacements: { from: string; to: string }[] }>("/speech/dictation");
    setSnips(cfg.snippets);
    setReps(cfg.replacements);
    snipsRef.current = cfg.snippets;
    repsRef.current = cfg.replacements;
    return cfg;
  }

  useEffect(() => {
    if (!locked && !snips.length) loadSpeech().catch(() => {});
  }, [locked]);

  async function toggleDictation() {
    if (dictRef.current) {
      dictRef.current.stop();
      dictRef.current = null;
      return;
    }
    setDictError(null);
    if (!editingRef.current) openSection(visible.find((x) => /hpi|subjective/.test(x.key))?.key ?? visible[0].key);
    const cfg = await loadSpeech();
    const d = new Dictation({ provider: cfg.provider, url: cfg.url }, {
      onFinal: (t) => handleVoiceRef.current(t),
      onInterim: setInterim,
      onStatus: (st, msg) => {
        setDictStatus(st);
        if (st === "error") {
          setDictError(msg ?? "Dictation stopped");
          dictRef.current = null;
        }
        if (st === "idle") dictRef.current = null;
      },
    });
    dictRef.current = d;
    await d.start();
  }

  function onAreaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
      e.preventDefault();
      toggleDictation();
      return;
    }
    if (e.key !== " " && e.key !== "Tab" && e.key !== "Enter") return;
    const a = e.currentTarget;
    const before = a.value.slice(0, a.selectionStart);
    const m = /(^|\s)\/([a-z0-9-]{2,24})$/i.exec(before);
    if (!m) return;
    const sn = snips.find((x) => x.trigger.toLowerCase() === m[2].toLowerCase());
    if (!sn) return;
    e.preventDefault();
    const start = before.length - m[2].length - 1;
    const body = expandSnippet(sn.body, snippetCtx ?? {});
    const next = a.value.slice(0, start) + body + a.value.slice(a.selectionStart);
    historyRef.current.push(a.value);
    setDraft(next);
    setTimeout(() => a.setSelectionRange(start + body.length, start + body.length), 0);
  }

  const listening = dictStatus === "listening" || dictStatus === "starting";
  const prov = provenance(note);
  const consent = note.sections.find((s) => s.key === "__consent");
  const all = visible.flatMap((s) => s.sentences.filter((x) => !x.pending && !x.heading));
  const strong = all.filter((s) => s.support === "strong").length;
  const weak = all.filter((s) => s.support !== "strong").length;
  const pending = visible.flatMap((s) => s.sentences.filter((x) => x.pending));
  const openFlags = omissions.filter((o) => !dismissed.has(o.id));
  const issues = useMemo(() => (snippetCtx?.patient ? checkConsistency(note, { dob: snippetCtx.patient.dob, sex: snippetCtx.patient.sex as "F" | "M" | "X", pronouns: snippetCtx.patient.pronouns ?? "" }, snippetCtx.today ?? new Date()) : []), [note, snippetCtx]);
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
        {issues.length > 0 && (<><span className="text-ink-4">·</span><span className="text-rec" data-testid="consistency-count">{issues.length} consistency issue{issues.length === 1 ? "" : "s"}</span></>)}
        {pending.length > 0 && (<><span className="text-ink-4">·</span><span className="text-default-ins-line">{pending.length} suggested normal finding{pending.length === 1 ? "" : "s"}</span></>)}
        <span className="ml-auto text-xs text-ink-3" data-testid="provenance">{note.meta.engine === "claude" ? `Drafted by ${note.meta.model}` : "Drafted by the on-device engine"} · {prov.edited + prov.clinician} of {prov.total} lines touched by you</span>
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setHistoryOpen(true)} data-testid="open-history">History</button>
        {onCalculators && <button className="btn-outline px-2.5 py-1 text-xs" onClick={onCalculators} data-testid="open-calculators">Calculators</button>}
        {!locked && (
          <button className={`btn-outline px-2.5 py-1 text-xs ${listening ? "border-rec text-rec" : ""}`} onClick={toggleDictation} title="Dictate into the note (Ctrl+Space)" data-testid="dictate">
            <Mic size={13} /> {listening ? "Stop dictating" : "Dictate"}
          </button>
        )}
      </div>
      {issues.length > 0 && !locked && (
        <div className="rounded-xl border border-rec/30 bg-rec-50 px-4 py-3 text-sm" data-testid="consistency">
          <p className="font-medium text-rec">Check before signing</p>
          <ul className="mt-1 space-y-1">
            {issues.map((iss, k) => (
              <li key={k} className="flex items-start gap-2 text-ink-2" data-testid="consistency-issue">
                <span className="flex-1">{iss.message}</span>
                <button className="text-xs font-medium text-brand hover:underline" onClick={() => { const el = document.querySelector(`[data-sid="${iss.sentenceIds[0]}"]`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Show</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!locked && (listening || dictError) && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-sm ${dictError ? "border-rec/30 bg-rec-50 text-rec" : "border-brand/30 bg-brand-50/60"}`} data-testid="dictation-bar" role="status">
          {dictError ? <span>{dictError}</span> : (
            <>
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rec opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rec" /></span>
              <span className="font-medium text-brand">Dictating into {visible.find((x) => x.key === editing)?.title ?? "the note"}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3" data-testid="dictation-interim">{interim || (heard ? `Heard: "${heard}"` : "Speak naturally. Say \"what can I say\" for commands.")}</span>
            </>
          )}
          <button className="text-xs font-medium text-brand" onClick={() => setHelpOpen(true)}>Voice commands</button>
        </div>
      )}

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
                  <textarea ref={areaRef} className="input min-h-[180px] font-sans text-sm leading-6" value={draft} onChange={(e) => { cursorRef.current = null; setDraft(e.target.value); }} onKeyDown={onAreaKey} onClick={() => { cursorRef.current = null; }} aria-label={`Edit ${sec.title}`} data-testid="section-textarea" />
                  <p className="text-xs text-ink-3">One sentence per line. Start a line with &ldquo;- &rdquo; to indent it under a problem. Type /shortcut and a space to insert a snippet. Unchanged lines keep their evidence links.</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {snips.length > 0 && (
                      <select className="input mr-auto w-52 py-1.5 text-xs" value="" onChange={(e) => { const sn = snips.find((x) => x.id === e.target.value); if (sn) insertAtCursor(expandSnippet(sn.body, snippetCtx ?? {})); }} aria-label="Insert snippet" data-testid="snippet-picker">
                        <option value="">Insert snippet…</option>
                        {snips.map((x) => <option key={x.id} value={x.id}>/{x.trigger} · {x.name}</option>)}
                      </select>
                    )}
                    <button className="btn-ghost" onClick={() => { dictRef.current?.stop(); setEditing(null); }}>Cancel</button>
                    <button className="btn-primary" disabled={busy} onClick={async () => { dictRef.current?.stop(); await save(patchSection(sec.key, (xs) => [...textToSentences(draft, xs.filter((x) => !x.pending), sec.key), ...xs.filter((x) => x.pending)]), "section.edited"); setEditing(null); }} data-testid="save-section">{busy && <Spinner />} Save</button>
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
                      <span className="flex-1"><span className="mr-1.5 text-[10px] font-semibold uppercase text-default-ins-line" data-testid={s.kind === "carried" ? "carried-label" : undefined}>{s.kind === "carried" ? "Carried forward · verify" : "Not examined · template"}</span>{s.text}</span>
                      <button className="text-ok hover:opacity-70" aria-label="Accept normal finding" title={s.kind === "carried" ? "Still accurate today" : "I examined this and it was normal"} onClick={() => save(patchSection(sec.key, (xs) => xs.map((x) => (x.id === s.id ? { ...x, pending: false, kind: "clinician", support: "strong" } : x))), "default.accepted")} data-testid="accept-default"><Check size={16} /></button>
                      <button className="text-ink-4 hover:text-rec" aria-label="Remove suggestion" onClick={() => save(patchSection(sec.key, (xs) => xs.filter((x) => x.id !== s.id)), "default.removed")}><X size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}

      <History encounterId={encounterId} open={historyOpen} onClose={() => setHistoryOpen(false)} locked={locked} onRestored={(n, om) => { noteRef.current = n; onSaved(n, om); }} />
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="What you can say">
        <table className="w-full text-sm" data-testid="voice-help">
          <tbody>
            {VOICE_HELP.map((h) => <tr key={h.say} className="border-t border-line first:border-0"><td className="py-1.5 pr-3 font-medium">&ldquo;{h.say}&rdquo;</td><td className="py-1.5 text-ink-3">{h.does}</td></tr>)}
          </tbody>
        </table>
        {snips.length > 0 && <p className="mt-3 text-xs text-ink-3">Snippets you can insert by name: {snips.map((x) => x.name).join(", ")}.</p>}
        <p className="mt-2 text-xs text-ink-3">Press Ctrl+Space in a section to start or stop dictating.</p>
      </Modal>

      {consent && (
        <div className="rounded-xl border border-ok/30 bg-ok-50 px-4 py-3 text-sm text-ok" data-testid="consent-line">
          <p className="text-[11px] font-semibold uppercase tracking-wide">Documentation consent · recorded by system</p>
          <p className="mt-1 text-ink-2">{consent.sentences[0]?.text}</p>
        </div>
      )}
    </div>
  );
}
