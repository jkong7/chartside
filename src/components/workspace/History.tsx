"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { SectionDiff } from "@/lib/engine/diff";
import type { Note, OmissionFlag } from "@/lib/types";
import { Modal, Spinner } from "../ui";

interface Rev {
  id: string;
  noteVersion: number;
  author: string | null;
  source: string;
  reason: string;
  createdAt: string;
  diff: SectionDiff[];
  provenance: { total: number; ai: number; edited: number; clinician: number };
}

const SOURCE: Record<string, string> = { "ai:local": "Drafted by the on-device engine", "ai:claude": "Drafted by Claude", edit: "Edited", dictation: "Dictated", assistant: "Changed by Ask Chartside", suggestion: "Suggestion accepted", restore: "Restored an earlier version", signature: "Signed" };

export default function History({ encounterId, open, onClose, locked, onRestored }: { encounterId: string; open: boolean; onClose: () => void; locked: boolean; onRestored: (n: Note, om?: OmissionFlag[]) => void }) {
  const [list, setList] = useState<Rev[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (open) api<{ revisions: Rev[] }>(`/encounters/${encounterId}/revisions`).then((r) => setList(r.revisions));
  }, [open, encounterId]);
  return (
    <Modal open={open} onClose={onClose} title="Note history" wide>
      {!list ? <div className="flex h-32 items-center justify-center text-brand"><Spinner /></div> : (
        <ol className="max-h-[70vh] space-y-3 overflow-y-auto" data-testid="history">
          {list.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-line p-3" data-testid="revision">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{SOURCE[r.source] ?? r.source}</span>
                <span className="text-ink-3">{r.author ?? "System"} · {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} · draft v{r.noteVersion}</span>
                <span className="ml-auto text-[11px] text-ink-4">{r.provenance.ai} AI-drafted · {r.provenance.edited} edited · {r.provenance.clinician} clinician-written</span>
                {!locked && i > 0 && <button className="btn-outline px-2 py-0.5 text-xs" disabled={!!busy} onClick={async () => { setBusy(r.id); const out = await api<{ note: Note; omissions: OmissionFlag[] }>(`/encounters/${encounterId}/revisions`, { body: { revisionId: r.id } }); onRestored(out.note, out.omissions); setBusy(null); onClose(); }} data-testid="restore">{busy === r.id ? <Spinner /> : null} Restore</button>}
              </div>
              {r.diff.length > 0 && r.source !== "ai:local" && r.source !== "ai:claude" && (
                <div className="mt-2 space-y-1.5 text-sm">
                  {r.diff.map((d) => (
                    <div key={d.key}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{d.title}</p>
                      {d.removed.map((x) => <p key={`-${x}`} className="rounded bg-rec-50 px-2 py-0.5 text-rec line-through" data-testid="diff-removed">{x}</p>)}
                      {d.added.map((x) => <p key={`+${x}`} className="rounded bg-ok-50 px-2 py-0.5 text-ok" data-testid="diff-added">{x}</p>)}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
