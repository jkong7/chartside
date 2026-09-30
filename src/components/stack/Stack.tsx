"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { Decision, DecisionResult } from "@/lib/server/decisions";
import { Alert, Check, Logo } from "../icons";
import { Spinner } from "../ui";
import ClaimBanner from "./ClaimBanner";
import StyleMatch from "../StyleMatch";
import InviteCard from "./InviteCard";
import NextTimeCard from "./NextTimeCard";
import LiveCallBanner from "@/components/ghost/LiveCallBanner";
import HomeScreenTip from "@/components/ghost/HomeScreenTip";
import NotifyToggle from "@/components/ghost/NotifyToggle";

interface StackUser {
  name: string;
  guestUntil: string | null;
  phone?: string | null;
}

const SWIPE = 110;

function order(list: Decision[], focus: string | null) {
  if (!focus) return list;
  const hit = (d: Decision) => d.id === focus || d.encounterId === focus;
  const first = list.filter(hit).sort((a, b) => Number(b.kind === "note.sign") - Number(a.kind === "note.sign"));
  return [...first, ...list.filter((d) => !hit(d))];
}

export default function Stack({ initial, user, focus, justClaimed = false, sample = false, callerPhone = null, styleMatched = true }: { initial: Decision[]; user: StackUser; focus: string | null; justClaimed?: boolean; sample?: boolean; callerPhone?: string | null; styleMatched?: boolean }) {
  const [styleOffer, setStyleOffer] = useState(!styleMatched);
  const [nextTime, setNextTime] = useState(justClaimed && !user.guestUntil);
  const [cards, setCards] = useState(() => order(initial, focus));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "rec"; text: string } | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dx, setDx] = useState(0);
  const [claimed, setClaimed] = useState(!user.guestUntil);
  const [invite, setInvite] = useState<{ referral: { url: string; message: string }; signed: number } | null>(null);
  const checkGrowth = useCallback(async () => {
    if (user.guestUntil) return;
    const g = await api<{ referral: { url: string; message: string }; signed: number; prompts: { invite: boolean } }>("/growth").catch(() => null);
    if (g?.prompts.invite) setInvite({ referral: g.referral, signed: g.signed });
  }, [user.guestUntil]);
  const shown = useRef(Date.now());
  const drag = useRef<{ x: number; id: number } | null>(null);
  const top = cards[0];
  const done = initial.length - cards.length;

  useEffect(() => {
    shown.current = Date.now();
    setBlockers(null);
    setChoice(null);
    setText(typeof top?.detail.draft === "string" ? top.detail.draft : "");
    offset.current = 0;
    setDx(0);
  }, [top?.id]);

  const approveSpec = top?.actions.find((a) => a.action === "approve");
  const needsChoice = top?.kind === "coding.query" || top?.kind === "patient.match";
  const canApprove = !!approveSpec && (!needsChoice || choice !== null) && (top?.kind !== "note.sign" || claimed);

  const act = useCallback(async (action: "approve" | "reject" | "snooze" | "draft", extra: Record<string, unknown> = {}) => {
    if (!top || busy) return;
    setBusy(true);
    setNote(null);
    const payload: Record<string, unknown> = { ...extra };
    if (action === "approve" && top.kind === "note.sign") payload.reviewMs = Date.now() - shown.current;
    if (action === "approve" && top.kind === "coding.query") payload.code = choice === "undetermined" ? null : choice;
    if (action === "approve" && top.kind === "patient.match") payload.patientId = choice;
    if (action === "approve" && top.kind === "message.reply") payload.text = text;
    if (action === "snooze") payload.minutes = 240;
    try {
      const r = await api<DecisionResult>(`/decisions/${encodeURIComponent(top.id)}`, { body: { action, payload, channel: "stack" } });
      if (action === "draft") {
        setCards((c) => [{ ...c[0], detail: { ...c[0].detail, draft: r.detail?.draft }, actions: c[0].actions.map((a) => (a.action === "draft" ? { action: "approve", label: "Send reply", needsScreen: true, payload: ["text"] } : a)) }, ...c.slice(1)]);
        setText(String(r.detail?.draft ?? ""));
      } else {
        setNote({ tone: "ok", text: r.message });
        const signedEnc = action === "approve" && top.kind === "note.sign" ? top.encounterId : null;
        setCards((c) => c.slice(1).filter((d) => !signedEnc || d.encounterId !== signedEnc || d.kind === "note.cosign"));
        if (action === "approve" && top.kind === "note.sign") checkGrowth();
      }
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { blockers?: string[] } | undefined) : undefined;
      if (data?.blockers?.length) setBlockers(data.blockers);
      else setNote({ tone: "rec", text: err instanceof Error ? err.message : "That didn't work" });
      offset.current = 0;
      setDx(0);
    }
    setBusy(false);
  }, [top, busy, choice, text, checkGrowth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" && canApprove) act("approve");
      if (e.key === "ArrowLeft") act("snooze");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, canApprove]);

  const offset = useRef(0);
  const move = (v: number) => {
    offset.current = v;
    setDx(v);
  };
  const onDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea, label, select, [data-noswipe]")) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const d = e.clientX - drag.current.x;
    move(d > 0 && !canApprove ? Math.min(d, 40) : d);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current.x === e.clientX ? offset.current : e.clientX - drag.current.x;
    drag.current = null;
    if (d > SWIPE && canApprove) act("approve");
    else if (d < -SWIPE) act("snooze");
    else move(0);
  };

  const counts = useMemo(() => cards.reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {}), [cards]);

  return (
    <main className="min-h-screen bg-paper pb-10">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Logo />
          <div className="min-w-0 flex-1">
            {user.guestUntil ? (
              <>
                <p className="text-sm font-semibold" data-testid="stack-count">{cards.length > 1 ? "Your notes" : cards.length ? "Your note" : "All caught up"}</p>
                <p className="truncate text-xs text-ink-3">Save it to keep it and sign it</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold" data-testid="stack-count">{cards.length ? `${cards.length} to review` : "All caught up"}</p>
                <p className="truncate text-xs text-ink-3">{done ? `${done} done this session · ` : ""}{counts["note.sign"] ? `${counts["note.sign"]} to sign` : "Nothing to sign"}</p>
              </>
            )}
          </div>
          <a className="text-sm font-medium text-brand" href={`/go/ask${top?.encounterId ? `?encounter=${top.encounterId}` : ""}`} data-testid="stack-ask">Ask</a>
          {!user.guestUntil && <a className="text-sm font-medium text-brand" href="/go/settings" data-testid="stack-settings">Settings</a>}
          {!user.guestUntil && <a className="text-sm font-medium text-brand" href="/today">Full app</a>}
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        {!user.guestUntil && <LiveCallBanner />}
        <HomeScreenTip />
        {sample && (
          <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2" data-testid="stack-sample">
            <span className="font-medium text-ink">Sample clinic day.</span> Your account came with example patients so you can try everything. Those example patients aren&apos;t real people.
          </p>
        )}
        {!user.guestUntil && <NotifyToggle />}
        {!claimed && <ClaimBanner onClaimed={() => setClaimed(true)} callerPhone={callerPhone} />}
        {nextTime && <NextTimeCard hasPhone={!!user.phone} onClose={() => setNextTime(false)} />}
        {invite && <InviteCard referral={invite.referral} signed={invite.signed} onClose={() => setInvite(null)} />}
        {note && <p className={`rounded-lg px-3 py-2 text-sm ${note.tone === "ok" ? "bg-ok-50 text-ok" : "bg-rec-50 text-rec"}`} role="status" data-testid="stack-toast">{note.text}</p>}
        {!top ? (
          <div className="card p-8 text-center" data-testid="stack-empty">
            <Check className="mx-auto h-8 w-8 text-ok" />
            <p className="mt-3 font-serif text-2xl">You&apos;re done.</p>
            <p className="mt-1 text-sm text-ink-3">Nothing is waiting on you. Close the laptop.</p>
          </div>
        ) : (
          <>
          <div className="relative">
            {cards[1] && <div className="card absolute inset-x-3 -bottom-2 h-full opacity-60" aria-hidden />}
            <article
              className="card relative touch-pan-y select-none p-5 shadow-sm transition-transform"
              style={{ transform: `translateX(${dx}px) rotate(${dx / 40}deg)`, transitionDuration: drag.current ? "0ms" : "200ms" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              data-testid="stack-card"
              data-kind={top.kind}
              aria-label={top.title}
            >
              {dx > 40 && canApprove && <span className="absolute right-4 top-4 rounded-md border-2 border-ok px-2 py-0.5 text-sm font-bold uppercase text-ok">{approveSpec?.label}</span>}
              {dx < -40 && <span className="absolute left-4 top-4 rounded-md border-2 border-ink-3 px-2 py-0.5 text-sm font-bold uppercase text-ink-3">Later</span>}
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label(top)}</p>
              <h1 className="mt-1 text-lg font-semibold leading-snug" data-testid="stack-title">{top.title}</h1>
              <p className="mt-0.5 text-sm text-ink-3">{top.summary}</p>
              {typeof top.detail.markedReady === "object" && top.detail.markedReady && <p className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand" data-testid="stack-ready">{(top.detail.markedReady as { label: string }).label}</p>}
              {typeof top.detail.summaryOnSign === "object" && top.detail.summaryOnSign && <p className="ml-1 mt-2 inline-flex rounded-full bg-info-50 px-2.5 py-0.5 text-xs font-medium text-info" data-testid="stack-summary-on-sign">{(top.detail.summaryOnSign as { label: string }).label}</p>}
              {typeof top.detail.unverifiedCaller === "object" && top.detail.unverifiedCaller && (
                <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-full bg-warn-50 px-2.5 py-0.5 text-xs font-medium text-warn" data-testid="stack-unverified" title={(top.detail.unverifiedCaller as { help: string }).help}>
                  {(top.detail.unverifiedCaller as { label: string }).label}
                  <span className="font-normal">· {(top.detail.unverifiedCaller as { help: string }).help}</span>
                </p>
              )}
              <Body d={top} choice={choice} setChoice={setChoice} text={text} setText={setText} />
              {blockers && (
                <div className="mt-4 rounded-lg bg-warn-50 p-3 text-sm text-warn" data-testid="stack-blockers">
                  <p className="flex items-center gap-1.5 font-medium"><Alert className="h-4 w-4" /> Fix these first, or sign anyway</p>
                  <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                  <button className="btn-outline mt-3 w-full" disabled={busy} onClick={() => act("approve", { force: true })} data-testid="stack-force">I reviewed these, sign anyway</button>
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="btn-outline" disabled={busy} onClick={() => act("snooze")} data-testid="stack-later">Later</button>
                {top.actions.some((a) => a.action === "draft") ? (
                  <button className="btn-primary" disabled={busy} onClick={() => act("draft")} data-testid="stack-draft">{busy && <Spinner />} Draft a reply</button>
                ) : approveSpec ? (
                  <button className="btn-primary" disabled={busy || !canApprove} onClick={() => act("approve")} data-testid="stack-approve">{busy && <Spinner />} {top.kind === "note.sign" && !claimed ? "Save to sign" : approveSpec.label}</button>
                ) : (
                  <a className="btn-primary text-center" href={top.openUrl}>Open</a>
                )}
              </div>
              {top.kind === "note.sign" && !claimed && (
                <button className="mt-2 w-full text-center text-sm font-medium text-brand underline" onClick={() => { const el = document.querySelector<HTMLInputElement>("[data-testid=claim-code], [data-testid=claim-email]"); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus(); }} data-testid="stack-save-hint">
                  Add your email above to keep this note and sign it
                </button>
              )}
              {top.actions.some((a) => a.action === "reject") && (
                <button className="mt-2 w-full text-center text-sm text-ink-3" disabled={busy} onClick={() => act("reject", { comment: text })} data-testid="stack-reject">{top.actions.find((a) => a.action === "reject")!.label}</button>
              )}
              <a className="mt-3 block text-center text-sm text-brand" href={top.openUrl} data-testid="stack-open">Open in the full app</a>
            </article>
          </div>
            <p className="mt-4 text-center text-xs text-ink-4">Swipe right to {approveSpec?.label.toLowerCase() ?? "open"}, left for later</p>
            {styleOffer && top.kind === "note.sign" && top.encounterId && (
              <div className="mt-4">
                <StyleMatch
                  key={top.encounterId}
                  encounterId={top.encounterId}
                  onClose={() => setStyleOffer(false)}
                  onSaved={(_r, applied, after) => {
                    if (applied) setCards((c) => c.map((d) => (d.encounterId === top.encounterId && d.kind === "note.sign" ? { ...d, detail: { ...d.detail, text: after } } : d)));
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function label(d: Decision) {
  switch (d.kind) {
    case "note.sign": return "Sign";
    case "note.cosign": return "Co-sign";
    case "coding.query": return "Documentation question";
    case "message.reply": return "Patient message";
    case "patient.match": return "Match a recording";
    case "task.review": return "Task";
    case "claim.exception": return "Billing";
    default: return "Suggested change";
  }
}

function Body({ d, choice, setChoice, text, setText }: { d: Decision; choice: string | null; setChoice: (v: string) => void; text: string; setText: (v: string) => void }) {
  if (d.kind === "note.sign") {
    return (
      <>
        <pre className="mt-4 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-sunken p-3 font-sans text-sm leading-relaxed text-ink-2" data-noswipe data-testid="stack-note">{String(d.detail.text ?? "")}</pre>
        <a className="mt-2 inline-block text-sm font-medium text-brand underline" href={d.openUrl} data-noswipe data-testid="stack-sources">
          Check any line against the recording
        </a>
      </>
    );
  }
  if (d.kind === "coding.query") {
    const opts = (d.detail.options as { code: string | null; label: string }[]) ?? [];
    return (
      <fieldset className="mt-4 space-y-2" data-testid="stack-options">
        {opts.map((o) => (
          <label key={o.code ?? "undetermined"} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${choice === (o.code ?? "undetermined") ? "border-brand bg-brand-50" : "border-line"}`}>
            <input type="radio" name="opt" className="mt-0.5 accent-brand" checked={choice === (o.code ?? "undetermined")} onChange={() => setChoice(o.code ?? "undetermined")} />
            <span>{o.label}{o.code && <span className="ml-1 font-mono text-xs text-ink-3">{o.code}</span>}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (d.kind === "patient.match") {
    const cands = (d.detail.candidates as { patientId: string; name: string; scheduledAt: string }[]) ?? [];
    return (
      <fieldset className="mt-4 space-y-2" data-testid="stack-candidates">
        {!cands.length && <p className="text-sm text-ink-3">No scheduled patients nearby. Open the visit to pick one.</p>}
        {cands.map((c) => (
          <label key={c.patientId} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${choice === c.patientId ? "border-brand bg-brand-50" : "border-line"}`}>
            <input type="radio" name="pat" className="accent-brand" checked={choice === c.patientId} onChange={() => setChoice(c.patientId)} />
            <span className="flex-1 font-medium">{c.name}</span>
            <span className="text-xs text-ink-3">{new Date(c.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (d.kind === "message.reply") {
    return (
      <div className="mt-4 space-y-3" data-noswipe>
        <blockquote className="rounded-lg bg-sunken p-3 text-sm text-ink-2">{String(d.detail.body ?? "")}</blockquote>
        {d.actions.some((a) => a.action === "approve") && <textarea className="input min-h-32 text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply" data-testid="stack-reply" />}
      </div>
    );
  }
  if (d.kind === "note.cosign") {
    return <p className="mt-4 text-sm text-ink-2">Written by {String(d.detail.author ?? "")}. Open the note to read it in full before co-signing.</p>;
  }
  if (d.kind === "proposal") {
    const diff = (d.detail.diff as { title: string; before: string; after: string }[] | undefined) ?? [];
    if (diff.length) {
      return (
        <div className="mt-4 space-y-3" data-noswipe data-testid="stack-diff">
          {diff.map((s) => (
            <div key={s.title} className="text-sm">
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 whitespace-pre-wrap rounded bg-rec-50 p-2 text-ink-2 line-through decoration-rec/50">{s.before || "(empty)"}</p>
              <p className="mt-1 whitespace-pre-wrap rounded bg-ok-50 p-2 text-ink">{s.after}</p>
            </div>
          ))}
        </div>
      );
    }
    return <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-sunken p-3 font-sans text-sm text-ink-2">{Object.entries(d.detail).filter(([k]) => k !== "source").map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")}</pre>;
  }
  return null;
}
