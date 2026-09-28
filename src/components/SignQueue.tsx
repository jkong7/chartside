"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { unsignedQueue } from "@/lib/server/queue";
import { Check, Shield } from "./icons";
import { Spinner, Toast } from "./ui";

type Row = Awaited<ReturnType<typeof unsignedQueue>>[number];

export default function SignQueue({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clean = rows.filter((r) => !r.blockers.length);
  const next = rows.find((r) => r.blockers.length);
  async function sign(ids: string[]) {
    setBusy(ids.length > 1 ? "all" : ids[0]);
    const r = await api<{ results: { id: string; signed: boolean }[]; queue: Row[] }>("/queue", { body: { ids } });
    setRows(r.queue);
    setToast(`${r.results.filter((x) => x.signed).length} note${r.results.filter((x) => x.signed).length === 1 ? "" : "s"} signed.`);
    setBusy(null);
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Sign queue</h1>
          <p className="mt-1 text-sm text-ink-2">Every note waiting for your signature, oldest first. Notes with nothing left to review can be signed here; the rest show what still needs you.</p>
        </div>
        {next && <Link className="btn-outline" href={`/encounters/${next.id}`} data-testid="queue-next">Review next ({rows.filter((r) => r.blockers.length).length})</Link>}
        {clean.length > 0 && <button className="btn-primary" disabled={!!busy} onClick={() => sign(clean.map((r) => r.id))} data-testid="queue-sign-all">{busy === "all" ? <Spinner /> : <Shield size={14} />} Sign {clean.length} ready note{clean.length === 1 ? "" : "s"}</button>}
      </div>
      <ul className="card mt-6 divide-y divide-line" data-testid="queue">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid="queue-row">
            <div className="min-w-0 flex-1">
              <Link href={`/encounters/${r.id}`} className="font-medium hover:text-brand">{r.patient}</Link>
              <p className="text-xs text-ink-3">{r.reason || "Visit"} · {new Date(r.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {r.ageHours < 1 ? "just now" : `${r.ageHours} h waiting`} · {r.words} words</p>
              {r.blockers.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-warn" data-testid="queue-blockers">{r.blockers.slice(0, 3).map((b) => <li key={b}>• {b}</li>)}</ul>}
            </div>
            {r.blockers.length ? <Link className="btn-outline px-2.5 py-1 text-xs" href={`/encounters/${r.id}`}>Review</Link> : <button className="btn-primary px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => sign([r.id])} data-testid="queue-sign">{busy === r.id ? <Spinner /> : <Check size={12} />} Sign</button>}
          </li>
        ))}
        {!rows.length && <li className="px-4 py-12 text-center text-sm text-ink-3" data-testid="queue-empty">You&apos;re caught up. No notes are waiting for your signature.</li>}
      </ul>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}
