"use client";

import { useState } from "react";
import { api, copyText } from "@/lib/client";
import type { Claim, ClaimLine } from "@/lib/engine/billing";
import type { PaPacket } from "@/lib/engine/priorauth";
import type { ClaimRecord } from "@/lib/server/repo";
import { Alert, Check, Copy, Download, Info, Link as LinkIcon, Pencil, Plus, X } from "../icons";
import { Empty, Spinner } from "../ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft (finalized at signing)", cls: "bg-sunken text-ink-2" },
  needs_review: { label: "Needs review", cls: "bg-warn-50 text-warn" },
  ready: { label: "Ready", cls: "bg-brand-50 text-brand" },
  approved: { label: "Approved", cls: "bg-ok-50 text-ok" },
  on_hold: { label: "On hold", cls: "bg-rec-50 text-rec" },
  submitted: { label: "Submitted", cls: "bg-info-50 text-info" },
};

export function ClaimStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <span className={`pill ${s.cls}`} data-testid="claim-status" data-claim-status={status}>{s.label}</span>;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function Evidence({ ids, onCite }: { ids: string[]; onCite: (ids: string[]) => void }) {
  const real = ids.filter((x) => x !== "chart");
  if (!real.length) return null;
  return (
    <button className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => onCite(real)}>
      <LinkIcon size={11} /> source
    </button>
  );
}

function PriorAuthCard({ encounterId, p, onChange, onCite }: { encounterId: string; p: PaPacket; onChange: (x: PaPacket[]) => void; onCite: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = async (submission: PaPacket["submission"]) => onChange((await api<{ priorAuth: PaPacket[] }>(`/encounters/${encounterId}/prior-auth`, { method: "PATCH", body: { packetId: p.id, submission } })).priorAuth);
  return (
    <div className="card p-4" data-testid="pa-packet">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{p.service}</p>
        <span className="font-mono text-xs text-ink-3">{p.code}</span>
        <span className={`pill ${p.status === "likely_approved" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`} data-testid="pa-status">{p.status === "likely_approved" ? "Criteria met" : "Missing criteria"}</span>
        <span className="pill ml-auto bg-sunken text-ink-2" data-testid="pa-submission">{p.submission}</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {p.criteria.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white ${c.met === true ? "bg-ok" : c.met === false ? "bg-rec" : "bg-ink-4"}`}>{c.met === true ? <Check size={11} /> : c.met === false ? <X size={11} /> : "?"}</span>
            <span className="flex-1"><span className="font-medium">{c.label}.</span> <span className="text-ink-2">{c.detail}</span></span>
            <Evidence ids={c.evidence} onCite={onCite} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "View"} medical necessity letter</button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => { await copyText(p.letter); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />} Copy letter</button>
        <div className="ml-auto flex gap-1.5">
          {p.submission === "draft" && <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => set("submitted")} data-testid="pa-submit">Mark submitted</button>}
          {p.submission === "submitted" && (
            <>
              <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => set("approved")}>Approved</button>
              <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => set("denied")}>Denied</button>
            </>
          )}
        </div>
      </div>
      {open && <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-sunken p-3 font-serif text-sm leading-6" data-testid="pa-letter">{p.letter}</pre>}
    </div>
  );
}

export default function BillingPanel({
  encounterId,
  record: initial,
  draft,
  priorAuth: initialPa,
  signed,
  canReview = true,
  onCite,
}: {
  encounterId: string;
  record: ClaimRecord | null;
  draft: Claim | undefined;
  priorAuth: PaPacket[];
  signed: boolean;
  canReview?: boolean;
  onCite: (ids: string[]) => void;
}) {
  const [record, setRecord] = useState(initial);
  const [pa, setPa] = useState(initialPa);
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [holdNote, setHoldNote] = useState("");
  const claim = record?.content ?? draft;
  if (!claim) return <Empty title="Billing appears after the note is drafted." />;
  const locked = !record || record.status === "submitted" || !canReview;
  const errors = claim.edits.filter((e) => e.severity === "error");

  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ record: ClaimRecord }>(`/encounters/${encounterId}/claim/action`, { body: { action, ...extra } });
      setRecord(r.record);
      setHoldNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update claim");
    } finally {
      setBusy(false);
    }
  }

  async function saveLines() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ record: ClaimRecord }>(`/encounters/${encounterId}/claim`, { method: "PUT", body: { lines } });
      setRecord(r.record);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save claim");
    } finally {
      setBusy(false);
    }
  }

  const shown = editing ? lines : claim.lines;
  return (
    <div className="space-y-5" data-testid="billing-panel">
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <p className="label">Professional claim · {claim.payer} · POS {claim.placeOfService}</p>
            <p className="font-serif text-3xl" data-testid="claim-total">{money(claim.totals.charges)}</p>
            <div className="mt-1"><ClaimStatus status={record?.status ?? "draft"} /></div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canReview && record && record.status !== "submitted" && record.status !== "approved" && (
              <button className="btn-primary" disabled={busy || errors.length > 0} onClick={() => act("approve")} data-testid="claim-approve" title={errors.length ? "Resolve errors first" : undefined}>{busy ? <Spinner /> : <Check />} Approve</button>
            )}
            {canReview && record?.status === "approved" && <button className="btn-primary" disabled={busy} onClick={() => act("submit")} data-testid="claim-submit">Submit to clearinghouse</button>}
            {canReview && record && (record.status === "approved" || record.status === "on_hold") && <button className="btn-outline" disabled={busy} onClick={() => act("reopen")}>Reopen</button>}
            {record && <a className="btn-outline" href={`/api/encounters/${encounterId}/claim/837`} data-testid="claim-837"><Download /> 837P</a>}
          </div>
        </div>
        {!record && <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">{signed ? "No claim was created for this visit." : "This is a preview. The claim is finalized from accepted orders when you sign the note, then routed to billing review."}</p>}
        {record && !canReview && <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2" data-testid="claim-readonly">Your billing team reviews and submits this claim.</p>}
        {canReview && record && record.status !== "submitted" && record.status !== "approved" && (
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="Hold reason (e.g. awaiting ABN, verify insurance)" value={holdNote} onChange={(e) => setHoldNote(e.target.value)} aria-label="Hold reason" />
            <button className="btn-outline" disabled={busy || !holdNote.trim()} onClick={() => act("hold", { note: holdNote })}>Hold</button>
          </div>
        )}
        {record?.reviewerNote && record.status === "on_hold" && <p className="mt-2 text-sm text-rec">Hold: {record.reviewerNote}</p>}
        {err && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      </div>

      {claim.edits.length > 0 && (
        <div className="card p-4" data-testid="claim-edits">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Claim edits</p>
          <ul className="mt-2 space-y-1.5">
            {claim.edits.map((e) => (
              <li key={e.id} className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm ${e.severity === "error" ? "bg-rec-50 text-rec" : e.severity === "warning" ? "bg-warn-50 text-warn" : "bg-info-50 text-info"}`} data-severity={e.severity}>
                {e.severity === "info" ? <Info size={14} className="mt-0.5 shrink-0" /> : <Alert size={14} className="mt-0.5 shrink-0" />}
                <span><span className="font-mono text-[11px] uppercase">{e.rule}</span> · {e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Diagnoses</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {claim.dx.map((d) => (
              <tr key={d.pointer} className="border-b border-line last:border-0">
                <td className="w-10 px-4 py-2 font-mono text-ink-3">{d.pointer}</td>
                <td className="w-24 py-2 font-mono font-medium">{d.code}</td>
                <td className="py-2 pr-4">{d.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto" data-testid="claim-lines">
        <div className="flex items-center border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Service lines</p>
          {!locked && !editing && <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => { setLines(claim.lines.map((l) => ({ ...l }))); setEditing(true); }} data-testid="edit-lines"><Pencil size={13} /> Edit</button>}
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3">
            <tr><th className="px-4 py-2">Code</th><th className="pr-4">Modifiers</th><th className="pr-4">Dx</th><th className="pr-4">Units</th><th className="pr-2 text-right">Charge</th><th className="px-4">Why</th>{editing && <th />}</tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={l.id} className="border-t border-line align-top" data-testid="claim-line" data-cpt={l.cpt}>
                <td className="px-4 py-2">
                  {editing ? <input className="input w-24 font-mono" value={l.cpt} onChange={(e) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, cpt: e.target.value } : x)))} aria-label="CPT code" /> : <><p className="font-mono font-medium">{l.cpt}</p><p className="text-xs text-ink-3">{l.description}</p></>}
                </td>
                <td className="py-2">{editing ? <input className="input w-20 font-mono" value={l.modifiers.join(",")} onChange={(e) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, modifiers: e.target.value.split(",").map((m) => m.trim()).filter(Boolean) } : x)))} aria-label="Modifiers" /> : <span className="font-mono">{l.modifiers.join(", ") || "—"}</span>}</td>
                <td className="py-2">{editing ? <input className="input w-20 font-mono" value={l.pointers.join("")} onChange={(e) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, pointers: e.target.value.toUpperCase().split("") } : x)))} aria-label="Diagnosis pointers" /> : <span className="font-mono">{l.pointers.join("")}</span>}</td>
                <td className="py-2">{l.units}</td>
                <td className="py-2 text-right font-mono">{money(l.charge)}</td>
                <td className="px-4 py-2 text-xs text-ink-2">{l.rationale} <Evidence ids={l.evidence} onCite={onCite} /></td>
                {editing && <td className="pr-3 pt-3"><button className="text-ink-4 hover:text-rec" onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove line"><X size={15} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <div className="flex items-center gap-2 border-t border-line px-4 py-3">
            <button className="btn-ghost text-xs" onClick={() => setLines((xs) => [...xs, { id: `ln_new${Date.now()}`, cpt: "", description: "Added by reviewer", modifiers: [], pointers: ["A"], units: 1, charge: 0, source: "manual", rationale: "Added by reviewer", evidence: [] }])}><Plus size={13} /> Add line</button>
            <button className="btn-ghost ml-auto" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={saveLines} data-testid="save-lines">{busy && <Spinner />} Save &amp; re-check</button>
          </div>
        )}
      </div>

      {claim.opportunities.length > 0 && (
        <div className="card p-4" data-testid="opportunities">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Missed revenue &amp; quality opportunities</p>
          <ul className="mt-2 divide-y divide-line">
            {claim.opportunities.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm" data-testid="opportunity">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.title} {o.value > 0 && <span className="ml-1 font-mono text-ok">+{money(o.value)}</span>}</p>
                  <p className="text-ink-2">{o.detail}</p>
                </div>
                <Evidence ids={o.evidence} onCite={onCite} />
                {o.line && record && !locked && <button className="btn-outline px-2.5 py-1 text-xs" disabled={busy} onClick={() => act("add_opportunity", { opportunityId: o.id })} data-testid="add-opportunity"><Plus size={13} /> Add to claim</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3" data-testid="prior-auth">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Prior authorization</p>
        {pa.length ? pa.map((p) => <PriorAuthCard key={p.id} encounterId={encounterId} p={p} onChange={setPa} onCite={onCite} />) : <p className="text-sm text-ink-3">No orders in this visit typically require prior authorization.</p>}
      </div>

      {record?.history.length ? (
        <div className="card p-4 text-sm">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Claim history</p>
          <ol className="mt-2 space-y-1">{record.history.map((h, i) => <li key={i} className="text-ink-2"><span className="font-mono text-xs text-ink-3">{new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> · {h.action}{h.note ? ` · ${h.note}` : ""}</li>)}</ol>
        </div>
      ) : null}
    </div>
  );
}
