"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ADDENDUM_KINDS, addendumTitle } from "@/lib/engine/attest";
import { Alert, Check, Plus, Shield } from "../icons";
import { Modal, Spinner } from "../ui";
import type { Bundle } from "./types";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function CosignBanner({ b, onChange, onToast }: { b: Bundle; onChange: () => void; onToast: (m: string) => void }) {
  const c = b.artifacts.cosign;
  const [pick, setPick] = useState(b.attestations[0]?.key ?? "");
  const [comment, setComment] = useState("");
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!c) return null;

  async function act(action: "cosign" | "return") {
    setBusy(true);
    setErr(null);
    try {
      await api(`/encounters/${b.encounter.id}/cosign`, { body: { action, attestation: pick, comment } });
      onToast(action === "cosign" ? "Co-signed. The attestation was added to the note." : `Returned to ${c!.authorName} for changes.`);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  if (c.status === "cosigned") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ok/30 bg-ok-50/60 px-4 py-2.5 text-sm" data-testid="cosign-done">
        <Shield size={15} className="text-ok" />
        <span className="font-medium text-ok">Co-signed by {c.supervisorName}</span>
        <span className="text-ink-3">{c.cosignedAt ? when(c.cosignedAt) : ""} · {c.attestation?.label}{c.attestation?.modifier ? ` · modifier ${c.attestation.modifier}` : ""}</span>
      </div>
    );
  }

  if (c.status === "returned") {
    return (
      <div className="mb-4 rounded-xl border border-warn/30 bg-warn-50/60 px-4 py-3 text-sm" data-testid="cosign-returned">
        <p className="flex items-center gap-1.5 font-semibold text-warn"><Alert size={15} /> Returned by {c.supervisorName} {c.returnedAt ? `· ${when(c.returnedAt)}` : ""}</p>
        <p className="mt-1 text-ink-2">&ldquo;{c.comment}&rdquo;</p>
        <p className="mt-1 text-xs text-ink-3">Make the changes, then sign again to send it back for co-signature.</p>
      </div>
    );
  }

  if (!b.access.cosign) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info-50/60 px-4 py-2.5 text-sm" data-testid="cosign-pending">
        <Shield size={15} className="text-info" />
        <span className="font-medium text-info">Awaiting co-signature from {c.supervisorName}</span>
        <span className="text-ink-3">requested {when(c.requestedAt)} · the claim is on hold until then</span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-brand/30 bg-brand-50/50 p-4" data-testid="cosign-panel">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand"><Shield size={15} /> {c.authorName}{c.authorCredential ? ` (${c.authorCredential})` : ""} signed this note and needs your co-signature</p>
      <div className="mt-3 space-y-2">
        {b.attestations.map((a) => (
          <label key={a.key} className={`block cursor-pointer rounded-lg border px-3 py-2 text-sm ${pick === a.key ? "border-brand bg-surface" : "border-line bg-surface/60"}`}>
            <span className="flex items-center gap-2">
              <input type="radio" name="attestation" value={a.key} checked={pick === a.key} onChange={() => setPick(a.key)} />
              <span className="font-medium">{a.label}</span>
              {a.modifier && <span className="pill bg-sunken text-[10px]">{a.modifier}</span>}
              <span className="ml-auto text-[11px] text-ink-4">{a.source}</span>
            </span>
            <span className="mt-1 block pl-6 text-xs text-ink-3">{a.preview}</span>
          </label>
        ))}
      </div>
      <textarea className="input mt-3 min-h-[60px] text-sm" placeholder={returning ? "What should the author change?" : "Optional: add your own findings or edits to the plan"} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="cosign-comment" />
      {err && <p className="mt-2 text-sm text-rec" role="alert">{err}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {returning ? (
          <>
            <button className="btn-ghost" onClick={() => setReturning(false)}>Cancel</button>
            <button className="btn-outline text-warn" disabled={busy || !comment.trim()} onClick={() => act("return")} data-testid="cosign-return-confirm">{busy ? <Spinner /> : null} Return to {c.authorName}</button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={() => setReturning(true)} data-testid="cosign-return">Return for changes</button>
            <button className="btn-primary" disabled={busy || !pick} onClick={() => act("cosign")} data-testid="cosign-submit">{busy ? <Spinner /> : <Check />} Co-sign</button>
          </>
        )}
      </div>
    </div>
  );
}

export function Addenda({ b, onChange, onToast }: { b: Bundle; onChange: () => void; onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof ADDENDUM_KINDS)[number]["value"]>("addendum");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sig = b.artifacts.signature;
  if (b.encounter.status !== "signed") return null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/encounters/${b.encounter.id}/addenda`, { body: { kind, text, reason } });
      setOpen(false);
      setText("");
      setReason("");
      onToast(`${addendumTitle(kind)} added and signed.`);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const help = ADDENDUM_KINDS.find((k) => k.value === kind)?.help;
  return (
    <section className="mt-6 space-y-3" data-testid="addenda">
      {sig && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span data-testid="signature-line">Signed electronically by <span className="font-medium text-ink-2">{sig.byName}{sig.credential ? `, ${sig.credential}` : ""}</span> · {when(sig.at)}</span>
          {b.chain.intact === true && <span className="pill bg-ok-50 text-[10px] text-ok" title={`${b.chain.checked} record(s) verified by SHA-256 hash chain`} data-testid="chain-ok"><Check size={10} /> Unaltered since signing</span>}
          {b.chain.intact === false && <span className="pill bg-rec-50 text-[10px] text-rec" data-testid="chain-broken"><Alert size={10} /> Integrity check failed</span>}
        </div>
      )}
      {b.addenda.map((a) => (
        <article key={a.id} className={`rounded-xl border px-4 py-3 ${a.kind === "attestation" ? "border-brand/30 bg-brand-50/40" : a.kind === "correction" ? "border-warn/30 bg-warn-50/40" : "border-line bg-surface"}`} data-testid="addendum">
          <header className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-ink-2">{addendumTitle(a.kind)}</span>
            <span className="text-ink-3">{a.author} · {when(a.createdAt)}</span>
            {a.filing?.status === "filed" && <span className="pill bg-info-50 text-[10px] text-info" title={a.filing.reference}>Filed to EHR</span>}
            {a.filing?.status === "error" && <span className="pill bg-rec-50 text-[10px] text-rec" title={a.filing.message}>EHR filing failed</span>}
          </header>
          {a.reason && a.kind !== "attestation" && <p className="mt-1 text-xs text-ink-3">Reason: {a.reason}</p>}
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{a.text}</p>
        </article>
      ))}
      {b.access.addendum && (
        <button className="btn-outline" onClick={() => setOpen(true)} data-testid="add-addendum"><Plus size={14} /> Add addendum</button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add to the signed note">
        <div className="space-y-3">
          <div className="flex gap-1.5" role="radiogroup">
            {ADDENDUM_KINDS.map((k) => (
              <button key={k.value} role="radio" aria-checked={kind === k.value} className={`rounded-lg border px-3 py-1.5 text-sm ${kind === k.value ? "border-brand bg-brand-50 text-brand" : "border-line"}`} onClick={() => setKind(k.value)} data-testid={`addendum-kind-${k.value}`}>{k.label}</button>
            ))}
          </div>
          <p className="text-xs text-ink-3">{help} The signed note is never changed; this is appended with your signature and time.</p>
          {kind !== "addendum" && <input className="input text-sm" placeholder={kind === "correction" ? "Reason for correction" : "Reason for late entry"} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="addendum-reason" />}
          <textarea className="input min-h-[120px] text-sm" placeholder="Addendum text" value={text} onChange={(e) => setText(e.target.value)} data-testid="addendum-text" />
          {err && <p className="text-sm text-rec" role="alert">{err}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy || text.trim().length < 3} onClick={save} data-testid="addendum-save">{busy ? <Spinner /> : <Shield />} Sign addendum</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
