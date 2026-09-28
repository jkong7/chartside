"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { ChartAnswer } from "@/lib/engine/chartqa";
import { Search } from "./icons";
import { Spinner } from "./ui";

const EXAMPLES = ["When was the last colonoscopy?", "A1c trend", "Current medications", "What did we decide about the eye exam?"];

export default function AskChart({ patientId, compact = false }: { patientId: string; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState<(ChartAnswer & { engine: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function ask(question: string) {
    setBusy(true);
    setErr(null);
    try {
      setA(await api(`/patients/${patientId}/ask`, { body: { question } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not answer");
    }
    setBusy(false);
  }
  return (
    <div className={compact ? "" : "card p-4"} data-testid="ask-chart">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q); }}>
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <input className="input pl-8 text-sm" placeholder="Ask about this patient's chart" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ask-input" />
        </div>
        <button className="btn-outline" disabled={busy || !q.trim()} data-testid="ask-submit">{busy ? <Spinner /> : null} Ask</button>
      </form>
      {!a && !compact && <div className="mt-2 flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} className="pill bg-sunken text-[11px] text-ink-3 hover:text-brand" onClick={() => { setQ(x); ask(x); }}>{x}</button>)}</div>}
      {err && <p className="mt-2 text-sm text-rec">{err}</p>}
      {a && (
        <div className="mt-3 rounded-lg bg-paper p-3 text-sm" data-testid="ask-answer">
          <p>{a.answer}</p>
          {a.citations.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-ink-3">
              {a.citations.map((c, i) => <li key={c.id}>[{i + 1}] {c.link ? <Link href={c.link} className="text-brand hover:underline">{c.title}</Link> : c.title}{c.date ? ` · ${c.date}` : ""} · {c.source === "record" ? "outside record" : c.source}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
