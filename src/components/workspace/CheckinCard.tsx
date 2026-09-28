"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "../ui";

type C = { url: string; sendAt: string; sentAt: string | null; sendStatus: string | null; submittedAt: string | null; flags: { level: string; text: string }[]; questions: { key: string; text: { en: string }; options?: { value: string; en: string }[] }[]; answers: Record<string, string> | null } | null;

export default function CheckinCard({ encounterId, signed, hasPatient }: { encounterId: string; signed: boolean; hasPatient: boolean }) {
  const [c, setC] = useState<C>(null);
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ checkin: C }>(`/encounters/${encounterId}/checkin`).then((r) => setC(r.checkin)).catch(() => undefined);
  useEffect(() => {
    load();
  }, [encounterId]);
  if (!hasPatient) return null;
  return (
    <div className="card p-4" data-testid="checkin-card">
      <p className="text-sm font-semibold">Post-visit check-in</p>
      {!c ? (
        signed ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-ink-3">Text or email the patient a one-minute check-in built from this visit: how they feel, new medicines, tests, and referrals. Answers land in your Inbox, triaged.</p>
            <div className="flex items-center gap-2">
              <select className="input w-32 py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="checkin-days"><option value={0}>Now</option><option value={2}>In 2 days</option><option value={3}>In 3 days</option><option value={7}>In 7 days</option></select>
              <button className="btn-primary px-3 py-1.5 text-sm" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await api(`/encounters/${encounterId}/checkin`, { body: { days } }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not schedule"); } setBusy(false); }} data-testid="checkin-schedule">{busy ? <Spinner /> : null} Schedule</button>
            </div>
          </div>
        ) : <p className="mt-2 text-xs text-ink-3">Available after you sign.</p>
      ) : (
        <div className="mt-2 space-y-1 text-sm" data-testid="checkin-status">
          <p className="text-xs text-ink-3">{c.submittedAt ? `Answered ${new Date(c.submittedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : c.sentAt ? `Sent ${new Date(c.sentAt).toLocaleDateString("en-US")} (${c.sendStatus})` : `Scheduled for ${new Date(c.sendAt).toLocaleDateString("en-US")}`}</p>
          {!c.submittedAt && <a className="block break-all text-[11px] text-brand" href={c.url} target="_blank" rel="noreferrer" data-testid="checkin-link">{c.url}</a>}
          {c.flags.map((f) => <p key={f.text} className={f.level === "routine" ? "text-warn" : "text-rec"}>{f.text}</p>)}
          {c.answers && <ul className="text-xs text-ink-2">{c.questions.filter((q) => c.answers![q.key]).map((q) => <li key={q.key}>{q.text.en} <span className="font-medium">{q.options?.find((o) => o.value === c.answers![q.key])?.en ?? c.answers![q.key]}</span></li>)}</ul>}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-rec">{err}</p>}
    </div>
  );
}
