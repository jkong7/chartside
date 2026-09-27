"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { Note } from "@/lib/types";
import { Send, Sparkle } from "../icons";
import { Spinner } from "../ui";

interface Msg {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
}

const SUGGESTIONS = ["Make the HPI shorter", "What did the patient say about side effects?", "Add patient declined flu vaccine to plan", "Insert normal exam"];

export default function Assistant({ encounterId, disabled, onNote, onCite }: { encounterId: string; disabled?: boolean; onNote: (n: Note) => void; onCite: (ids: string[]) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(message: string) {
    if (!message.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ reply: string; citations: string[]; note?: Note; action: string }>(`/encounters/${encounterId}/assist`, { body: { message } });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, citations: r.citations }]);
      if (r.note) onNote(r.note);
      if (r.citations.length) onCite(r.citations);
    } catch (err) {
      setMsgs((m) => [...m, { role: "assistant", text: err instanceof Error ? err.message : "Something went wrong" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-h-[45%] flex-col border-t border-line bg-surface" data-testid="assistant">
      <div className="flex items-center gap-1.5 px-3 pt-2.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
        <Sparkle size={13} /> Ask Chartside
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {!msgs.length && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} disabled={disabled || busy} onClick={() => send(s)} className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-ink-2 hover:bg-sunken disabled:opacity-50">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-brand-50 px-3 py-2 text-ink" : "mr-4 whitespace-pre-wrap rounded-lg bg-sunken px-3 py-2 text-ink-2"} data-testid={m.role === "assistant" ? "assistant-reply" : undefined}>
            {m.text}
            {m.citations?.length ? (
              <button className="mt-1 block text-xs font-medium text-brand" onClick={() => onCite(m.citations!)}>Show {m.citations.length} source{m.citations.length > 1 ? "s" : ""} in transcript</button>
            ) : null}
          </div>
        ))}
        {busy && <Spinner className="text-brand" />}
      </div>
      <form className="flex gap-2 p-3 pt-1" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="input" placeholder={disabled ? "Note is signed" : "Ask about the visit or edit the note…"} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled || busy} aria-label="Message Chartside" />
        <button className="btn-primary px-3" disabled={disabled || busy || !text.trim()} aria-label="Send"><Send /></button>
      </form>
    </div>
  );
}
