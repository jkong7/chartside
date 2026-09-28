"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { TcmEpisode } from "@/lib/server/tcm";
import { Spinner } from "./ui";

const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function TcmCard({ initial, canEdit }: { initial: TcmEpisode[]; canEdit: boolean }) {
  const [eps, setEps] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recent = eps.filter((e) => Date.now() - new Date(e.dischargeAt).getTime() < 45 * 86400000);
  if (!recent.length) return null;
  return (
    <section className="card mt-4 max-w-xl p-4" data-testid="tcm-card">
      <p className="label">Transitional care</p>
      {recent.map((e) => {
        const overdue = !e.contactAt && e.attempts < 2 && Date.now() > new Date(e.contactDue).getTime();
        return (
          <div key={e.id} className="text-sm" data-testid="tcm-episode">
            <p>Discharged {fmt(e.dischargeAt)} · {e.status === "billed" ? <span className="text-ok">billed {e.code}</span> : "open"}</p>
            <p className={`text-xs ${overdue ? "text-rec" : "text-ink-3"}`} data-testid="tcm-contact">{e.contactAt ? `Contact made ${fmt(e.contactAt)}` : e.attempts >= 2 ? `${e.attempts} attempts logged` : `Contact due by ${fmt(e.contactDue)}${e.attempts ? ` · ${e.attempts} attempt logged` : ""}${overdue ? " · overdue" : ""}`}</p>
            <p className="text-xs text-ink-3">Visit by {fmt(e.visitDue7)} for 99496 or {fmt(e.visitDue14)} for 99495</p>
            {canEdit && e.status === "open" && !e.contactAt && (
              <div className="mt-2 flex gap-2">
                {(["reached", "attempt"] as const).map((o) => (
                  <button key={o} className={o === "reached" ? "btn-primary px-2.5 py-1 text-xs" : "btn-outline px-2.5 py-1 text-xs"} disabled={!!busy} onClick={async () => { setBusy(`${e.id}:${o}`); setErr(null); try { const r = await api<{ episode: TcmEpisode }>(`/tcm/${e.id}`, { body: { outcome: o } }); setEps(eps.map((x) => (x.id === e.id ? r.episode : x))); } catch (x) { setErr(x instanceof Error ? x.message : "Could not save"); } setBusy(null); }} data-testid={`tcm-${o}`}>{busy === `${e.id}:${o}` ? <Spinner /> : null}{o === "reached" ? "Reached patient" : "Attempt, no answer"}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {err && <p className="mt-2 text-sm text-rec" role="alert">{err}</p>}
    </section>
  );
}
