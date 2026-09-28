"use client";

import { useState } from "react";
import { api, copyText } from "@/lib/client";
import type { IntakeRecord } from "@/lib/server/intake";
import { Alert, Copy } from "../icons";

const FREQ = ["not at all", "several days", "more than half the days", "nearly every day"];

export default function IntakeCard({ encounterId, intake, onChange }: { encounterId: string; intake?: IntakeRecord; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!intake) {
    return (
      <div className="card p-5" data-testid="intake-card">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Patient intake</h3>
        <p className="mt-2 text-sm text-ink-2">Send the patient a 3-minute questionnaire: reason for visit, medication check, allergies, mood, alcohol and tobacco, falls, and social needs. Answers appear here and count toward screening measures.</p>
        <button className="btn-outline mt-3" onClick={async () => { await api(`/encounters/${encounterId}/intake`, { body: {} }); onChange(); }} data-testid="intake-create">Create intake link</button>
      </div>
    );
  }
  const url = typeof window !== "undefined" ? `${window.location.origin}/intake/${intake.token}` : `/intake/${intake.token}`;
  if (!intake.submittedAt || !intake.answers || !intake.summary) {
    return (
      <div className="card p-5" data-testid="intake-card">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Patient intake · waiting for answers</h3>
        <p className="mt-2 break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs" data-testid="intake-link">{url}</p>
        <button className="btn-ghost mt-2 px-2 text-xs" onClick={async () => { await copyText(url); setCopied(true); }}><Copy size={12} /> {copied ? "Copied" : "Copy link for text or portal message"}</button>
      </div>
    );
  }
  const a = intake.answers;
  const s = intake.summary;
  return (
    <div className="card p-5" data-testid="intake-card">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Patient intake · answered {new Date(intake.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</h3>
      {s.flags.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="intake-flags">
          {s.flags.map((f) => <li key={f.text} className={`flex items-start gap-2 rounded-lg px-3 py-1.5 text-sm ${f.level === "urgent" ? "bg-rec-50 text-rec" : f.level === "warn" ? "bg-warn-50 text-warn" : "bg-info-50 text-info"}`}><Alert size={14} className="mt-0.5 shrink-0" />{f.text}</li>)}
        </ul>
      )}
      <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
        {a.reason && <div className="sm:col-span-2"><dt className="label">In their words</dt><dd>&ldquo;{a.reason}&rdquo;</dd></div>}
        {a.symptoms?.length ? <div><dt className="label">Symptoms</dt><dd>{a.symptoms.join(", ")}{a.duration ? ` · ${a.duration}` : ""}</dd></div> : null}
        {s.phq2 !== null && <div><dt className="label">PHQ-2 / GAD-2</dt><dd>{s.phq2}/6 · {s.gad2 ?? "–"}/6 <span className="text-xs text-ink-3">(down or hopeless: {FREQ[a.phq?.[1] ?? 0]})</span></dd></div>}
        {a.tobacco && <div><dt className="label">Tobacco</dt><dd>{a.tobacco === "current" ? "Current use" : a.tobacco === "former" ? "Former" : "Never"}</dd></div>}
        {s.auditc !== null && <div><dt className="label">AUDIT-C</dt><dd>{s.auditc}/12</dd></div>}
        {a.questions && <div className="sm:col-span-2"><dt className="label">Questions for you</dt><dd>&ldquo;{a.questions}&rdquo;</dd></div>}
      </dl>
    </div>
  );
}
