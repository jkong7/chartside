"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { StyleRule } from "@/lib/types";
import { Spinner } from "./ui";

interface Preview {
  findings: string[];
  rules: { kind: string; section: string; value: string; label: string }[];
  before: string;
  after: string;
}

export default function StyleMatch({ encounterId = null, open: startOpen = false, onSaved, onClose }: { encounterId?: string | null; open?: boolean; onSaved?: (rules: StyleRule[], applied: boolean, after: string) => void; onClose?: () => void }) {
  const [open, setOpen] = useState(startOpen);
  const [sample, setSample] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setPreview(await api<Preview>("/style-rules/match", { body: { sample, encounterId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't read that note");
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ saved: StyleRule[]; applied: boolean; rules: Preview["rules"]; after: string }>("/style-rules/match", { body: { sample, encounterId, save: true } });
      setDone(r.rules.length ? `Saved ${r.rules.length} style rule${r.rules.length === 1 ? "" : "s"}.${r.applied ? " Your note now uses them." : ""} Change them any time in Settings.` : "Saved. Your notes will match that length.");
      setPreview(null);
      onSaved?.(r.saved, r.applied, r.after);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
    }
    setBusy(false);
  }

  if (done) return <p className="rounded-lg bg-ok-50 px-3 py-2 text-sm text-ok" role="status" data-testid="style-done">{done}</p>;

  if (!open) {
    return (
      <section className="card p-4" data-testid="style-match">
        <p className="font-medium">Want it to sound like you?</p>
        <p className="mt-0.5 text-sm text-ink-2">Paste one of your old notes and we&apos;ll match its order, headings, length and shorthand.</p>
        <div className="mt-3 flex gap-2">
          <button className="btn-outline" onClick={() => setOpen(true)} data-testid="style-open">Paste an old note</button>
          {onClose && <button className="btn-ghost" onClick={onClose}>Not now</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="card p-4" data-testid="style-match" data-noswipe>
      {!preview ? (
        <form onSubmit={check} className="space-y-3">
          <div>
            <label className="font-medium" htmlFor="style-sample">Paste one of your old notes</label>
            <p className="mt-0.5 text-sm text-ink-3">Take out the patient&apos;s name, birth date and record number first. We only use it to learn your style.</p>
          </div>
          <textarea id="style-sample" className="input min-h-44 font-mono text-sm" value={sample} onChange={(e) => setSample(e.target.value)} placeholder={"S: ...\nO: ...\nA/P: ..."} required data-testid="style-sample" />
          {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !sample.trim()} data-testid="style-check">{busy && <Spinner />} Match my style</button>
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setError(null); onClose?.(); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="space-y-3" data-testid="style-preview">
          <div>
            <p className="font-medium">Here&apos;s what we noticed</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-2" data-testid="style-findings">
              {preview.findings.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Before</p>
              <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-sunken p-3 font-sans text-xs leading-relaxed text-ink-2" data-testid="style-before">{preview.before}</pre>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">In your style</p>
              <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-brand/30 bg-brand-50 p-3 font-sans text-xs leading-relaxed text-ink" data-testid="style-after">{preview.after}</pre>
            </div>
          </div>
          {preview.rules.length > 0 && (
            <div>
              <p className="text-sm font-medium">Rules we&apos;ll save</p>
              <ul className="mt-1 space-y-1 text-sm text-ink-2" data-testid="style-rules-list">
                {preview.rules.map((r) => <li key={`${r.kind}:${r.section}:${r.value}`}>• {r.label}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={save} data-testid="style-save">{busy && <Spinner />} Use my style</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setPreview(null)}>Try another note</button>
          </div>
        </div>
      )}
    </section>
  );
}
