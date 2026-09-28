"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Link as LinkIcon, Send, Users, X } from "../icons";
import { Modal, Spinner } from "../ui";

type Share = { id: string; kind: "member" | "external"; userName: string | null; email: string | null; access: "view" | "edit"; expiresAt: string | null; revokedAt: string | null; views: number; lastViewedAt: string | null; verifiedAt: string | null };

export default function ShareVisit({ encId, colleagues, sensitive }: { encId: string; colleagues: { id: string; name: string; role: string }[]; sensitive: boolean }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => setShares((await api<{ shares: Share[] }>(`/encounters/${encId}/shares`)).shares);
  useEffect(() => {
    if (open) load().catch(() => {});
  }, [open]);
  async function submit(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api(`/encounters/${encId}/shares`, { body });
      setOk(done);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not share");
    }
    setBusy(false);
  }
  const active = shares.filter((s) => !s.revokedAt);
  return (
    <>
      <button className="btn-outline" onClick={() => setOpen(true)} data-testid="share-visit"><Users size={14} /> Share{active.length ? ` (${active.length})` : ""}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Share this visit">
        <div className="space-y-5">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit({ kind: "member", userId: f.get("userId"), access: f.get("access"), message: f.get("message") }, "Shared with your colleague."); }}>
            <p className="label">A colleague in your organization</p>
            <div className="flex gap-2">
              <select name="userId" className="input flex-1" required data-testid="share-member"><option value="">Choose…</option>{colleagues.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}</select>
              <select name="access" className="input w-28" data-testid="share-access"><option value="view">Can view</option><option value="edit">Can edit</option></select>
            </div>
            <input name="message" className="input text-sm" placeholder="Note to your colleague (optional)" />
            <div className="flex justify-end"><button className="btn-primary" disabled={busy} data-testid="share-member-save">{busy ? <Spinner /> : <Send size={14} />} Share</button></div>
          </form>
          <form className="space-y-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit({ kind: "external", email: f.get("email"), days: Number(f.get("days")), message: f.get("message") }, "Link emailed. The recipient confirms with a one-time code."); }}>
            <p className="label">Someone outside your organization</p>
            {sensitive ? <p className="text-sm text-ink-3">Behavioral health notes can&apos;t be shared outside your organization.</p> : (
              <>
                <div className="flex gap-2">
                  <input name="email" type="email" className="input flex-1" required placeholder="cardiology@partnerclinic.org" data-testid="share-email" />
                  <select name="days" className="input w-28" defaultValue="7"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select>
                </div>
                <input name="message" className="input text-sm" placeholder="Message (optional)" data-testid="share-message" />
                <p className="text-xs text-ink-3">View only. The link works only after the recipient enters a code sent to this address, and every view is logged.</p>
                <div className="flex justify-end"><button className="btn-outline" disabled={busy} data-testid="share-external-save"><LinkIcon size={14} /> Email secure link</button></div>
              </>
            )}
          </form>
          {err && <p className="text-sm text-rec" role="alert">{err}</p>}
          {ok && <p className="text-sm text-ok" data-testid="share-ok">{ok}</p>}
          {shares.length > 0 && (
            <ul className="divide-y divide-line border-t border-line pt-2 text-sm" data-testid="share-list">
              {shares.map((s) => (
                <li key={s.id} className={`flex items-center gap-2 py-2 ${s.revokedAt ? "opacity-50" : ""}`} data-testid="share-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{s.kind === "member" ? s.userName : s.email}</p>
                    <p className="text-xs text-ink-3">{s.kind === "member" ? (s.access === "edit" ? "Can edit" : "Can view") : `External, view only${s.expiresAt ? `, until ${new Date(s.expiresAt).toLocaleDateString("en-US")}` : ""}`} · {s.revokedAt ? "revoked" : s.views ? `viewed ${s.views}×` : "not opened yet"}</p>
                  </div>
                  {!s.revokedAt && <button className="btn-ghost px-2 text-xs" onClick={async () => { await api(`/encounters/${encId}/shares/${s.id}`, { method: "DELETE" }); await load(); }} data-testid="share-revoke"><X size={12} /> Revoke</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
