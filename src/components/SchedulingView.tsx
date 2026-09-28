"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { followUpQueue } from "@/lib/server/schedule";
import { Calendar } from "./icons";
import { Spinner, Toast } from "./ui";

type Row = Awaited<ReturnType<typeof followUpQueue>>[number];

export default function SchedulingView({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [when, setWhen] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((r) => [r.id, `${r.target}T09:00`])));
  const [busy, setBusy] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ id: string; label: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Scheduling</h1>
      <p className="mt-1 text-sm text-ink-2">Follow-ups your clinicians asked for during visits. Each is suggested for the interval they said out loud; book it and send the patient a calendar invite.</p>
      {err && <p className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      {booked && <p className="mt-4 rounded-lg bg-ok-50 px-3 py-2 text-sm text-ok" data-testid="booked">{booked.label} · <a className="underline" href={`/api/encounters/${booked.id}/ics`} data-testid="ics">Download calendar invite</a></p>}
      <ul className="card mt-6 divide-y divide-line" data-testid="follow-up-queue">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="follow-up-row">
            <Calendar size={16} className="text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.patientName ?? "Patient"} · {r.title}</p>
              <p className="text-xs text-ink-3">{r.reason}{r.lastVisit ? ` · seen ${new Date(r.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}{r.clinicianName ? ` · ${r.clinicianName}` : ""}{r.encounterId ? <> · <Link className="text-brand" href={`/encounters/${r.encounterId}`}>visit</Link></> : null}</p>
            </div>
            <input type="datetime-local" className="input w-56 py-1 text-sm" value={when[r.id] ?? ""} onChange={(e) => setWhen((w) => ({ ...w, [r.id]: e.target.value }))} aria-label={`Date for ${r.patientName}`} data-testid="follow-up-when" />
            <button className="btn-primary" disabled={!!busy} onClick={async () => {
              setBusy(r.id);
              setErr(null);
              try {
                const out = await api<{ encounter: { id: string; scheduledAt: string }; queue: Row[] }>("/schedule/follow-ups", { body: { taskId: r.id, when: new Date(when[r.id]).toISOString() } });
                setRows(out.queue);
                setBooked({ id: out.encounter.id, label: `Booked ${r.patientName} for ${new Date(out.encounter.scheduledAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` });
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Could not book");
              } finally {
                setBusy(null);
              }
            }} data-testid="book">{busy === r.id ? <Spinner /> : null} Book</button>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-10 text-center text-sm text-ink-3">No follow-ups waiting to be scheduled.</li>}
      </ul>
      <Toast message={null} onDone={() => {}} />
    </div>
  );
}
