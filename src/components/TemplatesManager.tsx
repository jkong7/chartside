"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { extractFacts } from "@/lib/engine/extract";
import { buildNote, noteToText } from "@/lib/engine/note";
import type { SectionKind, Template, TemplateSection } from "@/lib/types";
import { Copy, Plus, X } from "./icons";
import { Spinner } from "./ui";

const KINDS: { id: SectionKind; label: string }[] = [
  { id: "subjective", label: "Subjective (CC + HPI)" },
  { id: "chief_complaint", label: "Chief complaint" },
  { id: "hpi", label: "HPI / interval history" },
  { id: "ros", label: "Review of systems" },
  { id: "pmh", label: "Past medical history" },
  { id: "medications", label: "Medications" },
  { id: "allergies", label: "Allergies" },
  { id: "social", label: "Social history" },
  { id: "family", label: "Family history" },
  { id: "objective", label: "Objective (vitals + exam + data)" },
  { id: "vitals", label: "Vitals" },
  { id: "exam", label: "Physical exam" },
  { id: "mental_status", label: "Mental status exam" },
  { id: "results", label: "Results / data reviewed" },
  { id: "assessment_plan", label: "Assessment & plan (by problem)" },
  { id: "assessment", label: "Assessment only" },
  { id: "plan", label: "Plan only" },
  { id: "patient_instructions", label: "Patient instructions" },
  { id: "follow_up", label: "Follow-up & precautions" },
  { id: "custom", label: "Custom (Claude only)" },
];

type Tpl = Template & { shared?: boolean; ownedByMe?: boolean };

export default function TemplatesManager({ initial, canShare = false }: { initial: Tpl[]; canShare?: boolean }) {
  const [list, setList] = useState(initial);
  const [sel, setSel] = useState<string>(initial[0]?.id ?? "soap");
  const [draft, setDraft] = useState<Tpl | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [demoKey, setDemoKey] = useState("gonzalez");
  const current: Tpl = draft ?? list.find((t) => t.id === sel)!;
  const readOnly = !current.userId || (!current.ownedByMe && !canShare);

  const preview = useMemo(() => {
    const d = DEMO_PATIENTS.find((x) => x.key === demoKey)!;
    const utts = d.script.map((l, i) => ({ id: `u${i}`, seq: i, speaker: l.s, text: l.t, tStart: i * 5, tEnd: i * 5 + 4 }));
    const facts = extractFacts(utts, d.chart, { pronouns: d.pronouns, sex: d.sex });
    const patient = { id: "demo", mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: d.language, chart: d.chart };
    return noteToText(buildNote(facts, { patient, encounter: { reason: d.visit.reason, visitType: d.visit.type, scheduledAt: new Date().toISOString() }, template: current }));
  }, [current, demoKey]);

  function edit(patch: Partial<Template>) {
    setDraft({ ...current, ...patch });
  }
  function editSection(i: number, patch: Partial<TemplateSection>) {
    edit({ sections: current.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }

  async function duplicate() {
    setBusy(true);
    const { template } = await api<{ template: Tpl }>("/templates", { body: { duplicateOf: current.id } });
    setList((l) => [...l, template]);
    setSel(template.id);
    setDraft(null);
    setBusy(false);
    setMsg("Duplicated. You can now edit your copy.");
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const { template } = await api<{ template: Tpl }>(`/templates/${draft.id}`, { method: "PUT", body: draft });
      setList((l) => l.map((t) => (t.id === template.id ? template : t)));
      setDraft(null);
      setMsg("Template saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await api(`/templates/${current.id}`, { method: "DELETE" });
    const next = list.filter((t) => t.id !== current.id);
    setList(next);
    setSel(next[0].id);
    setDraft(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Templates</h1>
      <p className="mt-1 text-sm text-ink-2">Choose how notes are structured. Duplicate a system template to make it your own; the preview re-renders a demo visit as you edit.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-1" data-testid="template-list">
          {list.map((t) => (
            <button key={t.id} onClick={() => { setSel(t.id); setDraft(null); setMsg(null); }} className={`w-full rounded-lg px-3 py-2.5 text-left ${t.id === sel ? "bg-brand-50" : "hover:bg-sunken"}`}>
              <p className={`text-sm font-medium ${t.id === sel ? "text-brand" : ""}`}>{t.name}</p>
              <p className="text-xs text-ink-3">{!t.userId ? "System" : t.shared ? (t.ownedByMe ? "Shared by you" : "Shared with org") : "Yours"} · {t.specialty}</p>
            </button>
          ))}
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {readOnly ? <h2 className="text-lg font-semibold">{current.name}</h2> : <input className="input text-base font-semibold" value={current.name} onChange={(e) => edit({ name: e.target.value })} aria-label="Template name" />}
              <p className="mt-1 text-sm text-ink-3">{current.description}</p>
            </div>
            {readOnly ? <button className="btn-outline" onClick={duplicate} disabled={busy} data-testid="duplicate"><Copy /> Duplicate</button> : <button className="btn-ghost text-rec" onClick={remove}>Delete</button>}
          </div>
          {current.userId && canShare && (
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={!!current.shared} onChange={(e) => edit({ shared: e.target.checked } as Partial<Tpl>)} data-testid="share-template" />
              Share with everyone in the organization
            </label>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="verb">Verbosity</label>
              <select id="verb" className="input" disabled={readOnly} value={current.style.verbosity ?? "standard"} onChange={(e) => edit({ style: { ...current.style, verbosity: e.target.value as "concise" } })}>
                <option value="concise">Concise</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="spec">Specialty</label>
              <input id="spec" className="input" disabled={readOnly} value={current.specialty} onChange={(e) => edit({ specialty: e.target.value })} />
            </div>
          </div>
          <p className="label mt-5">Sections</p>
          <ol className="space-y-2">
            {current.sections.map((s, i) => (
              <li key={i} className="rounded-lg border border-line p-3" data-testid="template-section">
                <div className="flex items-center gap-2">
                  <input className="input font-medium" disabled={readOnly} value={s.title} onChange={(e) => editSection(i, { title: e.target.value })} aria-label="Section title" />
                  {!readOnly && (
                    <div className="flex flex-col">
                      <button className="text-xs text-ink-3 disabled:opacity-30" disabled={i === 0} onClick={() => { const xs = [...current.sections]; [xs[i - 1], xs[i]] = [xs[i], xs[i - 1]]; edit({ sections: xs }); }} aria-label="Move up">▲</button>
                      <button className="text-xs text-ink-3 disabled:opacity-30" disabled={i === current.sections.length - 1} onClick={() => { const xs = [...current.sections]; [xs[i + 1], xs[i]] = [xs[i], xs[i + 1]]; edit({ sections: xs }); }} aria-label="Move down">▼</button>
                    </div>
                  )}
                  {!readOnly && <button className="text-ink-4 hover:text-rec" onClick={() => edit({ sections: current.sections.filter((_, j) => j !== i) })} aria-label="Remove section"><X /></button>}
                </div>
                <div className="mt-2 flex gap-2">
                  <select className="input" disabled={readOnly} value={s.kind} onChange={(e) => editSection(i, { kind: e.target.value as SectionKind })} aria-label="Section content">
                    {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                  <select className="input w-32" disabled={readOnly} value={s.format} onChange={(e) => editSection(i, { format: e.target.value as "bullets" })} aria-label="Format">
                    <option value="paragraph">Paragraph</option>
                    <option value="bullets">Bullets</option>
                  </select>
                </div>
                <input className="input mt-2 text-xs" disabled={readOnly} placeholder="Instructions for this section (used by Claude), e.g. 'Include PHQ-9 score if discussed'" value={s.instructions ?? ""} onChange={(e) => editSection(i, { instructions: e.target.value })} aria-label="Section instructions" />
              </li>
            ))}
          </ol>
          {!readOnly && (
            <div className="mt-3 flex items-center justify-between">
              <button className="btn-ghost" onClick={() => edit({ sections: [...current.sections, { key: `s${Date.now().toString(36)}`, title: "New section", kind: "custom", format: "bullets" }] })}><Plus /> Add section</button>
              <button className="btn-primary" disabled={!draft || busy} onClick={save} data-testid="save-template">{busy && <Spinner />} Save template</button>
            </div>
          )}
          {msg && <p className="mt-3 text-sm text-brand" role="status">{msg}</p>}
        </div>

        <div className="card flex min-w-0 flex-col lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Live preview</p>
            <select className="input w-auto py-1 text-xs" value={demoKey} onChange={(e) => setDemoKey(e.target.value)} aria-label="Preview visit">
              {DEMO_PATIENTS.map((d) => <option key={d.key} value={d.key}>{d.name} · {d.visit.reason}</option>)}
            </select>
          </div>
          <pre className="max-h-[70vh] flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-6" data-testid="template-preview">{preview}</pre>
        </div>
      </div>
    </div>
  );
}
