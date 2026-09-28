"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { AgendaItem } from "@/lib/engine/agenda";
import { Check } from "../icons";

const TONE: Record<AgendaItem["category"], string> = {
  urgent: "bg-rec-50 text-rec",
  treatment: "bg-warn-50 text-warn",
  results: "bg-warn-50 text-warn",
  follow_up: "bg-info-50 text-info",
  open_loop: "bg-info-50 text-info",
  gap: "bg-sunken text-ink-3",
  risk: "bg-sunken text-ink-3",
  new_patient: "bg-brand-50 text-brand",
};

const LABEL: Record<AgendaItem["category"], string> = { urgent: "Urgent", treatment: "Treatment", results: "Result", follow_up: "Follow-up", open_loop: "Open loop", gap: "Care gap", risk: "Risk adjustment", new_patient: "New patient" };

export default function Agenda({ encounterId, items, compact = false, onChange }: { encounterId: string; items: AgendaItem[]; compact?: boolean; onChange?: (items: AgendaItem[]) => void }) {
  const [list, setList] = useState(items);
  const shown = compact ? list.slice(0, 8) : list;
  if (!list.length) return null;
  const done = list.filter((i) => i.addressed).length;
  return (
    <div className={compact ? "" : "card p-5"} data-testid="agenda">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Visit agenda</h3>
        <span className="text-xs text-ink-3" data-testid="agenda-progress">{done} of {list.length} covered</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {shown.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-sm" data-testid="agenda-item">
            <button
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${i.addressed ? "border-ok bg-ok text-white" : "border-line"}`}
              aria-label={i.addressed ? "Mark not covered" : "Mark covered"}
              onClick={async () => {
                const r = await api<{ agenda: AgendaItem[] }>(`/encounters/${encounterId}/agenda`, { body: { key: i.key, done: !i.addressed } });
                setList(r.agenda);
                onChange?.(r.agenda);
              }}
              data-testid="agenda-toggle"
            >{i.addressed && <Check size={11} />}</button>
            <div className="min-w-0">
              <p className={i.addressed ? "text-ink-3 line-through" : ""}>{i.text} <span className={`pill ml-1 text-[10px] ${TONE[i.category]}`}>{LABEL[i.category]}</span></p>
              {!compact && <p className="text-xs text-ink-3">{i.why}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
