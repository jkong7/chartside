"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { reviewDetail } from "@/lib/server/qa";
import { Check } from "./icons";
import { Spinner } from "./ui";

type Data = Awaited<ReturnType<typeof reviewDetail>>;

export default function QaReview({ initial, rubric, canReview }: { initial: Data; rubric: { key: string; label: string; help: string }[]; canReview: boolean }) {
  const [d, setD] = useState(initial);
  const [scores, setScores] = useState<Record<string, number>>(initial.review.scores ?? {});
  const [comment, setComment] = useState(initial.review.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = d.review.status === "done";
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <Link href="/qa" className="text-sm text-ink-3 hover:text-ink">← Note QA</Link>
      <h1 className="mt-2 font-serif text-2xl">Review: {d.review.clinicianName} · {d.encounter?.reason}</h1>
      <p className="text-sm text-ink-3">Selected by {d.review.reason} · signed {d.encounter?.signedAt ? new Date(d.encounter.signedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""} · <Link className="text-brand" href={`/encounters/${d.review.encounterId}`}>open visit</Link></p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        <section className="card max-h-[75vh] overflow-y-auto p-4" data-testid="qa-note">
          <p className="label">Signed note</p>
          {d.note?.sections.filter((s) => !s.key.startsWith("__")).map((s) => (
            <div key={s.key} className="mt-3"><p className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{s.title}</p><ul className="mt-1 space-y-0.5 text-sm">{s.sentences.filter((x) => !x.pending).map((x) => <li key={x.id} className={x.edited ? "bg-warn-50/60" : ""}>{x.text}</li>)}</ul></div>
          ))}
          {d.changes.length > 0 && <p className="mt-4 text-xs text-ink-3">Highlighted lines were changed by the clinician. {d.changes.reduce((n, c) => n + c.added.length + c.removed.length, 0)} lines differ from the AI draft.</p>}
        </section>
        <section className="card max-h-[75vh] overflow-y-auto p-4" data-testid="qa-transcript">
          <p className="label">Transcript</p>
          <ul className="mt-2 space-y-1.5 text-sm">{d.transcript.map((u) => <li key={u.id}><span className="font-semibold text-ink-2">{u.speaker === "clinician" ? "Clinician" : u.speaker === "patient" ? "Patient" : "Other"}:</span> {u.text}</li>)}</ul>
        </section>
        <section className="card space-y-3 self-start p-4" data-testid="qa-form">
          <p className="text-sm font-semibold">Rubric</p>
          {rubric.map((r) => (
            <div key={r.key}>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-[11px] text-ink-4">{r.help}</p>
              <div className="mt-1 flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} disabled={done || !canReview} className={`h-7 w-7 rounded border text-xs ${scores[r.key] === n ? "border-brand bg-brand text-white" : "border-line"}`} onClick={() => setScores((s) => ({ ...s, [r.key]: n }))} data-testid={`score-${r.key}-${n}`}>{n}</button>)}</div>
            </div>
          ))}
          <textarea className="input min-h-[80px] text-sm" placeholder="Findings and coaching for the clinician" value={comment} disabled={done || !canReview} onChange={(e) => setComment(e.target.value)} data-testid="qa-comment" />
          {err && <p className="text-sm text-rec" role="alert">{err}</p>}
          {done ? <p className="flex items-center gap-1 text-sm text-ok" data-testid="qa-done"><Check size={14} /> Reviewed by {d.review.reviewerName}</p> : canReview && <button className="btn-primary w-full" disabled={busy || rubric.some((r) => !scores[r.key])} onClick={async () => { setBusy(true); setErr(null); try { setD(await api<Data>(`/qa/${d.review.id}`, { body: { scores, comment } })); } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } }} data-testid="qa-submit">{busy ? <Spinner /> : <Check size={14} />} Submit review</button>}
        </section>
      </div>
    </div>
  );
}
