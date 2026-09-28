"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { groupDetail } from "@/lib/server/group";
import { Users } from "./icons";
import { Spinner, StatusPill, Toast } from "./ui";

type Detail = NonNullable<Awaited<ReturnType<typeof groupDetail>>>;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function GroupView({ initial }: { initial: Detail }) {
  const [g, setG] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const name = (id: string | null) => g.members.find((m) => m.id === id)?.name ?? null;

  async function assign(utteranceId: string, memberId: string) {
    const r = await api<{ group: Detail }>(`/groups/${g.id}`, { body: { action: "assign", utteranceId, memberId: memberId || null } });
    setG(r.group);
  }

  async function makeNotes() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ group: Detail }>(`/groups/${g.id}`, { body: { action: "notes" } });
      setG(r.group);
      setToast("Member notes drafted. Review and sign each one.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create member notes");
    }
    setBusy(false);
  }

  const patientLines = g.utterances.filter((u) => u.speaker !== "clinician");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <Link href="/groups" className="text-sm text-ink-3 hover:text-ink">← Groups</Link>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">{g.title}</h1>
          <p className="mt-1 text-sm text-ink-2">{g.members.length} members{g.durationS ? ` · ${Math.round(g.durationS / 60)} minutes` : ""}</p>
        </div>
        <Link className="btn-outline" href={`/encounters/${g.encounterId}`} data-testid="group-recording">{g.utterances.length ? "Open recording" : "Record session"}</Link>
        <button className="btn-primary" disabled={busy || !g.utterances.length} onClick={makeNotes} data-testid="group-make-notes">{busy ? <Spinner /> : <Users size={14} />} {g.memberNotes.some((m) => m.encounterId) ? "Refresh member notes" : "Create member notes"}</button>
      </div>
      {err && <p className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="group-members">
        {g.members.map((m) => {
          const p = g.participation.find((x) => x.id === m.id)!;
          const n = g.memberNotes.find((x) => x.memberId === m.id)!;
          return (
            <div key={m.id} className="card p-4" data-testid="group-member">
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-ink-3" data-testid="group-member-lines">{p.lines} line{p.lines === 1 ? "" : "s"} attributed</p>
              <div className="mt-2">{n.encounterId ? <Link href={`/encounters/${n.encounterId}`} className="inline-flex items-center gap-2 text-sm text-brand" data-testid="group-member-note">Member note <StatusPill status={n.status!} /></Link> : <span className="text-xs text-ink-4">No note yet</span>}</div>
            </div>
          );
        })}
      </div>
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-3">Who said what</h2>
      <p className="mt-1 text-xs text-ink-3">Lines are attributed from how you address members. Fix anything wrong before creating notes; only a member&apos;s own lines go into their note.{g.unassigned ? ` ${g.unassigned} line${g.unassigned === 1 ? " is" : "s are"} unassigned.` : ""}</p>
      <ol className="card mt-2 divide-y divide-line" data-testid="group-transcript">
        {g.utterances.map((u) => (
          <li key={u.id} className="flex items-start gap-3 px-4 py-2.5 text-sm" data-testid="group-line">
            <span className="w-10 shrink-0 font-mono text-[11px] text-ink-4">{fmt(u.tStart)}</span>
            <p className={`flex-1 ${u.speaker === "clinician" ? "text-ink-2" : ""}`}>{u.text}</p>
            {u.speaker === "clinician" ? <span className="w-40 shrink-0 text-right text-xs text-ink-4">Facilitator</span> : (
              <select className={`input w-40 shrink-0 px-2 py-1 text-xs ${!u.assigned ? "border-warn text-warn" : ""}`} value={u.assigned ?? ""} onChange={(e) => assign(u.id, e.target.value)} aria-label={`Speaker for ${u.text.slice(0, 30)}`} data-testid="group-assign">
                <option value="">Unassigned</option>
                {g.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </li>
        ))}
        {!g.utterances.length && <li className="px-4 py-10 text-center text-sm text-ink-3">Record the session to see the transcript.</li>}
      </ol>
      {patientLines.length > 0 && <p className="mt-2 text-xs text-ink-4">{patientLines.filter((u) => u.assigned).length} of {patientLines.length} member lines attributed · {g.members.map((m) => `${name(m.id)?.split(" ")[0]} ${g.participation.find((x) => x.id === m.id)!.lines}`).join(" · ")}</p>}
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}
