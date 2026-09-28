"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Shield } from "../icons";
import { Spinner } from "../ui";

const REASONS = ["Treating the patient now", "Emergency", "Coding or billing review", "Quality or compliance review", "Patient request for records", "Other"];

export default function BreakGlass({ encounterId, message, onOpened }: { encounterId: string; message: string; onOpened: () => void }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <form className="card w-full max-w-md p-6" data-testid="break-glass" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api(`/encounters/${encounterId}/break-glass`, { body: { reason, detail } });
          onOpened();
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Could not open the note");
          setBusy(false);
        }
      }}>
        <p className="flex items-center gap-2 text-sm font-semibold text-warn"><Shield size={16} /> Restricted note</p>
        <p className="mt-2 text-sm text-ink-2">{message} You aren&apos;t on this patient&apos;s care team for this visit. Your name, reason, and the time are recorded and appear in the patient&apos;s access report.</p>
        <label className="mt-4 block"><span className="label">Reason</span><select className="input" value={reason} onChange={(e) => setReason(e.target.value)} required data-testid="break-glass-reason"><option value="">Choose…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="mt-3 block"><span className="label">Details {reason === "Other" ? "(required)" : "(optional)"}</span><input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} data-testid="break-glass-detail" /></label>
        {err && <p className="mt-3 text-sm text-rec" role="alert">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Link href="/today" className="btn-ghost">Go back</Link>
          <button className="btn-primary" disabled={busy || !reason} data-testid="break-glass-open">{busy ? <Spinner /> : null} Open note</button>
        </div>
      </form>
    </div>
  );
}
