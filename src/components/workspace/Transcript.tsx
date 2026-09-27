"use client";

import { useEffect, useRef, useState } from "react";
import type { SegmentPlayer } from "@/lib/audio/player";
import { fmtClock } from "@/lib/client";
import type { Speaker, Utterance } from "@/lib/types";
import { Eye, EyeOff, Play, Stop } from "../icons";
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
  player = null,
  flagged,
}: {
  utterances: Utterance[];
  highlight?: Highlight | null;
  editable: boolean;
  interim?: string;
  onSpeaker?: (id: string, speaker: Speaker) => void;
  onRedact?: (id: string, redacted: boolean) => void;
  follow?: boolean;
  player?: SegmentPlayer | null;
  flagged?: Set<string>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ids = new Set(highlight?.ids ?? []);
  const [playing, setPlaying] = useState<string | null>(null);
  const multilingual = new Set(utterances.map((u) => u.lang).filter((l) => l && l !== "und")).size > 1;

  async function play(u: Utterance) {
    if (!player) return;
    if (playing === u.id) {
      player.stop();
      setPlaying(null);
      return;
    }
    setPlaying(u.id);
    const ok = await player.play(u.tStart, Math.max(u.tEnd, u.tStart + 1), () => setPlaying((p) => (p === u.id ? null : p)));
    if (!ok) setPlaying(null);
  }

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
          <div key={u.id} data-uid={u.id} className={`group flex gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${hit ? "bg-evidence-strong/70 ring-1 ring-warn/40" : ""} ${flagged?.has(u.id) ? "border-l-2 border-warn" : ""} ${u.redacted ? "opacity-50" : ""}`}>
            {player ? (
              <button type="button" onClick={() => play(u)} className={`mt-0.5 flex h-5 w-10 shrink-0 items-center justify-end gap-0.5 font-mono text-[11px] ${playing === u.id ? "text-brand" : "text-ink-4 hover:text-brand"}`} aria-label={`Play audio at ${fmtClock(u.tStart)}`} data-testid="play-line">
                {playing === u.id ? <Stop size={10} /> : <Play size={10} />}{fmtClock(u.tStart)}
              </button>
            ) : (
              <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[11px] text-ink-4">{fmtClock(u.tStart)}</span>
            )}
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
              {multilingual && u.lang && u.lang !== "und" && <span className="mr-1.5 rounded bg-sunken px-1 font-mono text-[10px] uppercase text-ink-3" data-testid="lang-chip">{u.lang}</span>}
              {u.source === "final" && u.confidence !== null && u.confidence !== undefined && u.confidence < 0.6 && <span className="mr-1.5 rounded bg-warn-50 px-1 text-[10px] text-warn" title="Low transcription confidence">low confidence</span>}
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
