"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Logo, Send } from "../icons";
import { Spinner } from "../ui";

interface Card {
  id: string;
  title: string;
  summary: string;
  url: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  cards?: Card[];
}

const STARTERS = ["What's waiting on me?", "Who's next today?", "Explain the codes on my last visit", "Add to the plan: recheck BP in 2 weeks"];

export default function AskChat({ encounterId, offline }: { encounterId: string | null; offline: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [turns, busy]);

  async function send(value: string) {
    const q = value.trim();
    if (!q || busy) return;
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ reply: string; cards: Card[] }>("/agent", { body: { messages: next.map(({ role, content }) => ({ role, content })), encounterId } });
      setTurns([...next, { role: "assistant", content: r.reply, cards: r.cards }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper" data-ready={ready ? "true" : undefined} data-testid="ask">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Logo />
          <p className="flex-1 text-sm font-semibold">Ask your chart</p>
          <a className="text-sm font-medium text-brand" href="/go/stack">To review</a>
        </div>
      </header>
      <section className="mx-auto w-full max-w-xl flex-1 space-y-3 px-4 py-4" aria-live="polite" data-testid="ask-thread">
        {!turns.length && (
          <div className="space-y-3 pt-6 text-center">
            <p className="font-serif text-2xl">What do you need?</p>
            <p className="text-sm text-ink-3">I read the chart and draft changes. You approve them in your stack. I never sign or send anything.</p>
            {offline && <p className="text-xs text-ink-4" data-testid="ask-offline">Running offline: simple questions only.</p>}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {STARTERS.map((s) => <button key={s} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2" onClick={() => send(s)} data-testid="ask-starter">{s}</button>)}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : "space-y-2"}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${t.role === "user" ? "bg-brand text-white" : "bg-surface text-ink shadow-sm"}`} data-testid={t.role === "user" ? "ask-user" : "ask-reply"}>{t.content}</p>
            {t.cards?.map((c) => (
              <a key={c.id} href={c.url} className="card block max-w-[85%] border-brand p-3" data-testid="ask-card">
                <p className="text-xs font-medium uppercase tracking-wide text-brand">Ready to review</p>
                <p className="mt-0.5 text-sm font-medium">{c.title}</p>
                <p className="text-xs text-ink-3">{c.summary} · Open in your stack</p>
              </a>
            ))}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-ink-3"><Spinner /> Checking the chart…</p>}
        {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
        <div ref={end} />
      </section>
      <form className="sticky bottom-0 border-t border-line bg-paper px-4 py-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <div className="mx-auto flex max-w-xl gap-2">
          <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a patient or a visit" aria-label="Message" data-testid="ask-input" />
          <button className="btn-primary" disabled={busy || !text.trim()} aria-label="Send" data-testid="ask-send"><Send className="h-4 w-4" /></button>
        </div>
      </form>
    </main>
  );
}
