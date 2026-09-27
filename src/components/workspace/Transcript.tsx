"use client";

import { useEffect, useRef } from "react";
import { fmtClock } from "@/lib/client";
import type { Speaker, Utterance } from "@/lib/types";
import { Eye, EyeOff } from "../icons";
import type { Highlight } from "./types";

const SPK: Record<Speaker, { label: string; cls: string }> = {
  clinician: { label: "Clinician", cls: "bg-brand-50 text-brand" },
  patient: { label: "Patient", cls: "bg-info-50 text-info" },
  other: { label: "Other", cls: "bg-sunken text-ink-2" },
};

const NEXT: Record<Speaker, Speaker> = { clinician: "patient", patient: "other", other: "clinician" };

export default function Transcript({
  utterances,
  highlight,
  editable,
  interim,
  onSpeaker,
  onRedact,
  follow = false,
}: {
  utterances: Utterance[];
  highlight?: Highlight | null;
  editable: boolean;
  interim?: string;
  onSpeaker?: (id: string, speaker: Speaker) => void;
  onRedact?: (id: string, redacted: boolean) => void;
  follow?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ids = new Set(highlight?.ids ?? []);

  useEffect(() => {
    if (!highlight?.ids.length || !box.current) return;
    const el = box.current.querySelector(`[data-uid="${highlight.ids[0]}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [utterances.length, interim, follow]);

  return (
    <div ref={box} className="h-full space-y-1 overflow-y-auto px-3 py-3" data-testid="transcript">
      {!utterances.length && !interim && <p className="px-2 py-8 text-center text-sm text-ink-3">The transcript will appear here as you talk.</p>}
      {utterances.map((u) => {
        const hit = ids.has(u.id);
        return (
          <div key={u.id} data-uid={u.id} className={`group flex gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${hit ? "bg-evidence-strong/70 ring-1 ring-warn/40" : ""} ${u.redacted ? "opacity-50" : ""}`}>
            <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[11px] text-ink-4">{fmtClock(u.tStart)}</span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!editable}
                onClick={() => onSpeaker?.(u.id, NEXT[u.speaker])}
                title={editable ? "Click to change speaker" : undefined}
                className={`pill mr-1.5 align-[1px] text-[10px] ${SPK[u.speaker].cls} ${editable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                data-testid="speaker-chip"
              >
                {SPK[u.speaker].label}
                {u.speakerSource === "auto" && editable ? "·auto" : ""}
              </button>
              <span className={u.redacted ? "line-through" : ""}>{u.redacted ? "Redacted by clinician" : u.text}</span>
            </div>
            {editable && onRedact && (
              <button className="invisible shrink-0 self-start text-ink-4 hover:text-ink group-hover:visible" onClick={() => onRedact(u.id, !u.redacted)} title={u.redacted ? "Restore" : "Redact from note"} aria-label={u.redacted ? "Restore utterance" : "Redact utterance"}>
                {u.redacted ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            )}
          </div>
        );
      })}
      {interim && (
        <div className="flex gap-2 px-2 py-1.5 text-sm italic text-ink-3">
          <span className="w-10 shrink-0" />
          <span>{interim}…</span>
        </div>
      )}
    </div>
  );
}
