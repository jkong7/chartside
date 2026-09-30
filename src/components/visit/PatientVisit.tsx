"use client";

import { useCallback, useEffect, useState } from "react";
import type { VisitRecap } from "@/lib/engine/visitRecap";
import { Spinner } from "../ui";
import PatientRecorder from "./PatientRecorder";
import Recap, { RecapFooter } from "./Recap";

interface View {
  status: "consent" | "declined" | "recording" | "processing" | "ready" | "failed";
  patientName: string | null;
  state: string;
  stateName: string;
  allParty: boolean;
  clinicianName: string | null;
  recordedAt: string | null;
  visitTime: string | null;
  durationS: number | null;
  lastSeq: number;
  audioBytes: number;
  recap: VisitRecap | null;
  transcript: { id: string; speaker: string; text: string }[];
  notes: string;
  family: { active: boolean; expiresAt: string | null };
  offer: { status: string | null; channel: string | null; expiresAt: string | null; open: boolean };
  saved: { at: string; contact: string } | null;
  expiresAt: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again.");
  return j as T;
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4 font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">C</span>
        Chartside
      </header>
      <div className={`mx-auto px-4 pb-16 ${wide ? "max-w-2xl" : "max-w-md"}`}>{children}</div>
    </main>
  );
}

export default function PatientVisit({ token }: { token: string }) {
  const [v, setV] = useState<View | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [justAgreed, setJustAgreed] = useState(false);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/visit/${token}`, { cache: "no-store" }).catch(() => null);
    if (!r) return;
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) setGone(j.error ?? "This visit link has expired or was deleted.");
    else if (r.ok) setV(j);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = v?.status === "processing" || (finished && v?.status === "recording");
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(load, 1500);
    return () => window.clearInterval(t);
  }, [waiting, load]);

  if (gone) return <Shell><div className="card mt-10 p-6 text-center" data-testid="pv-gone"><p className="font-serif text-2xl">Nothing here</p><p className="mt-2 text-ink-2">{gone}</p><a className="btn-primary mt-5" href="/visit">Record a new visit</a></div></Shell>;
  if (!v) return <Shell><div className="flex justify-center py-24 text-brand"><Spinner /></div></Shell>;

  if (v.status === "consent") return <Shell><Consent token={token} v={v} onDone={async (d) => { if (d === "granted") setJustAgreed(true); await load(); }} /></Shell>;
  if (v.status === "recording" && !finished) {
    return (
      <Shell>
        {justAgreed && <p className="mb-4 rounded-lg bg-ok-50 px-3 py-2 text-center text-sm text-ok" role="status" data-testid="pv-agreed">Thank you! You can hand the phone back now.</p>}
        <PatientRecorder token={token} autoStart={justAgreed} resumeFrom={justAgreed ? 0 : v.lastSeq + 1} priorSeconds={justAgreed ? 0 : v.durationS ?? 0} onFinished={() => { setFinished(true); void load(); }} />
      </Shell>
    );
  }
  if (waiting) return <Shell><div className="py-16 text-center" data-testid="pv-processing"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand" aria-hidden /><p className="mt-4 font-serif text-2xl text-ink">Writing your recap…</p><p className="mt-1 text-ink-3">This usually takes under a minute. You can keep this page open.</p></div></Shell>;
  if (v.status === "failed") return <Shell><Failed token={token} onRetry={() => { setFinished(true); void load(); }} /></Shell>;
  return <Shell wide><Ready token={token} v={v} reload={load} /></Shell>;
}

function Consent({ token, v, onDone }: { token: string; v: View; onDone: (d: "granted" | "declined") => void }) {
  const [step, setStep] = useState<"handoff" | "clinician">("handoff");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [others, setOthers] = useState(false);
  const [othersOk, setOthersOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = v.patientName || "Your patient";

  async function decide(decision: "granted" | "declined") {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/visit/${token}/consent`, "POST", { decision, clinicianName: name, clinicianContact: contact, othersPresent: others, allPartiesConfirmed: othersOk });
      onDone(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  if (step === "handoff") {
    return (
      <div className="card mt-6 p-6 text-center" data-testid="pv-handoff">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 font-serif text-2xl text-brand" aria-hidden>1</span>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-ink">Ask your clinician first</h1>
        <p className="mt-3 text-ink-2">When they come in, hand them your phone. They&apos;ll see a short question and tap Agree or Not today. Nothing is recorded until they agree.</p>
        <button className="btn-primary mt-6 w-full py-3 text-base" onClick={() => setStep("clinician")} data-testid="pv-handoff-go">I&apos;m handing my phone over</button>
        <a className="mt-4 inline-block text-sm text-ink-3 underline" href="/visit#faq">Is this legal where I am?</a>
      </div>
    );
  }

  const blocked = v.allParty && others && !othersOk;
  return (
    <div className="card mt-4 p-6" role="dialog" aria-labelledby="pv-ask" data-testid="pv-clinician">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">For the clinician</p>
      <h1 id="pv-ask" className="mt-2 font-serif text-2xl font-semibold leading-snug text-ink" data-testid="pv-ask">{who} would like to record this visit for their own notes. A draft note can be offered to you. OK to record?</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">The recording stays with your patient. You won&apos;t see anything unless you choose to, and you&apos;d confirm who you are first. Free, no strings.</p>
      {v.allParty && (
        <div className="mt-4 rounded-lg bg-info-50 p-3 text-sm text-ink" data-testid="pv-all-party">
          <p className="font-medium">{v.stateName} needs everyone in the room to agree.</p>
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4" checked={others} onChange={(e) => { setOthers(e.target.checked); if (!e.target.checked) setOthersOk(false); }} data-testid="pv-others" /> Someone else is in the room (a nurse, a student, family)</label>
          {others && <label className="mt-2 flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4" checked={othersOk} onChange={(e) => setOthersOk(e.target.checked)} data-testid="pv-others-ok" /> I asked, and they all agreed</label>}
        </div>
      )}
      <details className="mt-4 rounded-lg border border-line px-3 py-2" data-testid="pv-offer-details">
        <summary className="cursor-pointer text-sm font-medium text-brand">Want a free draft of your own note? (optional)</summary>
        <label className="label mt-3" htmlFor="pv-cname">Your name</label>
        <input id="pv-cname" className="input text-base" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Lee" data-testid="pv-clinician-name" />
        <label className="label mt-3" htmlFor="pv-ccontact">Your mobile or email</label>
        <input id="pv-ccontact" className="input text-base" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="(312) 555-0142 or you@clinic.com" data-testid="pv-clinician-contact" />
        <p className="mt-2 pb-1 text-xs text-ink-3">We&apos;ll send one message with a link, and nothing about the patient. Only this phone or email can open the draft: we send a code to it first.</p>
      </details>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button className="btn-outline py-3 text-base" disabled={busy} onClick={() => decide("declined")} data-testid="pv-decline">Not today</button>
        <button className="btn-primary py-3 text-base" disabled={busy || blocked} onClick={() => decide("granted")} data-testid="pv-agree">{busy && <Spinner />} Agree</button>
      </div>
      {blocked && <p className="mt-2 text-sm text-warn" data-testid="pv-blocked">Check that everyone agreed before recording.</p>}
      {error && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
    </div>
  );
}

function Failed({ token, onRetry }: { token: string; onRetry: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card mt-8 p-6 text-center" data-testid="pv-failed">
      <p className="font-serif text-2xl text-ink">We couldn&apos;t write your recap yet</p>
      <p className="mt-2 text-ink-2">Your recording is saved. This usually means we couldn&apos;t hear the conversation clearly, or our speech service was busy.</p>
      <button className="btn-primary mt-5 w-full py-3" data-testid="pv-retry" onClick={async () => { try { await call(`/api/visit/${token}/retry`, "POST"); onRetry(); } catch (err) { setError(err instanceof Error ? err.message : "Try again in a minute"); } }}>Try again</button>
      {error && <p className="mt-3 text-sm text-rec" role="alert">{error}</p>}
    </div>
  );
}

function Copy({ text, label, testid }: { text: string; label: string; testid: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input font-mono text-xs" readOnly value={text} aria-label={label} data-testid={testid} onFocus={(e) => e.target.select()} />
      <button className="btn-outline shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); } catch { setDone(false); } }}>{done ? "Copied" : "Copy"}</button>
    </div>
  );
}

function Ready({ token, v, reload }: { token: string; v: View; reload: () => Promise<void> }) {
  const [family, setFamily] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ url: string; message: string } | null>(null);
  const [contact, setContact] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [notes, setNotes] = useState(v.notes);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState<{ clinicianCopy: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const share = async (url: string, text: string) => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (nav.share) await nav.share({ title: "Visit notes", text, url }).catch(() => undefined);
  };

  if (deleted) {
    return (
      <div className="card mt-8 p-6 text-center" data-testid="pv-deleted">
        <p className="font-serif text-2xl text-ink">Everything is deleted</p>
        <p className="mt-2 text-ink-2">The recording, the written conversation and your recap are gone for good.{deleted.clinicianCopy ? " Your clinician already accepted the draft, so their copy stays in their own records." : ""}</p>
        <a className="btn-primary mt-5" href="/visit">Record another visit</a>
      </div>
    );
  }

  const declined = v.status === "declined";
  return (
    <div data-testid="pv-ready" data-status={v.status}>
      <p className="text-sm text-ink-3">{declined ? "Your notes" : "Your visit"}{v.recordedAt ? ` · ${day(v.recordedAt)}` : ""}{v.visitTime ? ` at ${v.visitTime}` : ""}{v.clinicianName ? ` · ${v.clinicianName}` : ""}</p>
      {declined ? (
        <div className="card mt-3 p-5" data-testid="pv-declined">
          <h1 className="font-serif text-2xl font-semibold text-ink">No problem. Nothing was recorded.</h1>
          <p className="mt-2 text-ink-2">You can still jot down what you want to remember. Your notes stay on this page, and you can download them.</p>
          <p className="mt-4 text-sm font-medium text-ink-2">Good things to write down:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Any new medicine, the dose and how often</li>
            <li>Tests you need, and when</li>
            <li>When to come back</li>
            <li>What to watch for, and who to call</li>
          </ul>
        </div>
      ) : (
        v.recap && <div className="mt-3"><Recap recap={v.recap} /></div>
      )}

      <section className="card mt-4 p-5" data-testid="pv-notes">
        <h2 className="font-semibold text-ink">{declined ? "Your notes" : "Add your own notes"}</h2>
        <textarea className="input mt-2 min-h-[110px] text-base" value={notes} onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }} aria-label="Your notes" placeholder="Anything you want to remember" data-testid="pv-notes-input" />
        <button className="btn-outline mt-2" disabled={busy === "notes"} onClick={() => act("notes", async () => { await call(`/api/visit/${token}/notes`, "PUT", { notes }); setNotesSaved(true); })} data-testid="pv-notes-save">{notesSaved ? "Saved" : "Save notes"}</button>
      </section>

      <div className="mt-4 grid gap-4">
        <section className="card p-5" data-testid="pv-family">
          <h2 className="font-semibold text-ink">Share with family</h2>
          <p className="mt-1 text-sm text-ink-3">A read-only link to your {declined ? "notes" : "recap"}. It stops working after 7 days, or whenever you turn it off.</p>
          {family ? (
            <div className="mt-3 space-y-2">
              <Copy text={family} label="Family link" testid="pv-family-url" />
              <div className="flex flex-wrap gap-2">
                {canShare && <button className="btn-primary" onClick={() => share(family, "My visit notes")}>Share</button>}
                <button className="btn-ghost text-rec" disabled={busy === "unshare"} onClick={() => act("unshare", async () => { await call(`/api/visit/${token}/family`, "DELETE"); setFamily(null); await reload(); })} data-testid="pv-family-stop">Stop sharing</button>
              </div>
            </div>
          ) : v.family.active ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-ok">A family link is on until {day(v.family.expiresAt!)}.</span>
              <button className="btn-ghost" disabled={busy === "family"} onClick={() => act("family", async () => setFamily((await call<{ url: string }>(`/api/visit/${token}/family`, "POST")).url))} data-testid="pv-family-new">Make a new link</button>
              <button className="btn-ghost text-rec" onClick={() => act("unshare", async () => { await call(`/api/visit/${token}/family`, "DELETE"); await reload(); })} data-testid="pv-family-stop">Stop sharing</button>
            </div>
          ) : (
            <button className="btn-primary mt-3" disabled={busy === "family"} onClick={() => act("family", async () => setFamily((await call<{ url: string }>(`/api/visit/${token}/family`, "POST")).url))} data-testid="pv-family-create">Make a family link</button>
          )}
        </section>

        {!declined && (
          <section className="card p-5" data-testid="pv-offer">
            <h2 className="font-semibold text-ink">Offer the draft to your doctor</h2>
            {v.offer.status === "claimed" ? (
              <p className="mt-1 text-sm text-ok" data-testid="pv-offer-claimed">Your clinician accepted the draft note. Your recap stays yours.</p>
            ) : v.offer.status === "sent" && v.offer.open ? (
              <div className="mt-1 text-sm text-ink-2" data-testid="pv-offer-sent">
                <p>We sent your clinician a free draft of their visit note ({v.offer.channel}). The offer ends {day(v.offer.expiresAt!)}.</p>
                <button className="mt-2 text-sm text-ink-3 underline" onClick={() => act("withdraw", async () => { await call(`/api/visit/${token}/offer`, "DELETE"); await reload(); })} data-testid="pv-offer-withdraw">Take the offer back</button>
              </div>
            ) : offer ? (
              <div className="mt-3 space-y-2" data-testid="pv-offer-link">
                <p className="text-sm text-ink-2">Send this to your clinician&apos;s office. It has nothing about your health in it. Before they see the draft, they enter their license number (NPI), and it has to match the name you gave.</p>
                <Copy text={offer.url} label="Link for your doctor" testid="pv-offer-url" />
                <div className="flex flex-wrap gap-2">
                  {canShare && <button className="btn-primary" onClick={() => share(offer.url, offer.message)}>Share</button>}
                  <button className="btn-ghost text-sm" onClick={() => act("withdraw", async () => { await call(`/api/visit/${token}/offer`, "DELETE"); setOffer(null); await reload(); })}>Take the offer back</button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1 text-sm text-ink-3">Your clinician can get a free draft of their visit note from your recording. It saves them typing, and there&apos;s nothing about your health in the link.{v.offer.status === "withdrawn" ? " You took the last offer back." : ""}</p>
                {!v.clinicianName && (
                  <div className="mt-3">
                    <label className="label" htmlFor="pv-offer-name">Your clinician&apos;s name</label>
                    <input id="pv-offer-name" className="input text-base" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Dr. Jane Smith" autoComplete="off" data-testid="pv-offer-name" />
                    <p className="mt-1 text-xs text-ink-3">Only someone whose license number matches this name can open the draft.</p>
                  </div>
                )}
                <button className="btn-outline mt-3" disabled={busy === "offer" || (!v.clinicianName && doctorName.trim().length < 2)} onClick={() => act("offer", async () => { setOffer(await call<{ url: string; message: string }>(`/api/visit/${token}/offer`, "POST", v.clinicianName ? undefined : { clinicianName: doctorName })); await reload(); })} data-testid="pv-offer-create">Get a link for my doctor</button>
              </>
            )}
          </section>
        )}

        <section className="card p-5" data-testid="pv-save">
          <h2 className="font-semibold text-ink">Keep this page</h2>
          {v.saved ? (
            <p className="mt-1 text-sm text-ok" data-testid="pv-saved">Saved until {day(v.expiresAt)}. We sent the link to {v.saved.contact}.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-3">Unsaved visits are deleted on {day(v.expiresAt)}. Enter your phone or email and we&apos;ll send you the link, with nothing about your health in the message.</p>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void act("save", async () => { await call(`/api/visit/${token}/save`, "POST", { contact }); await reload(); }); }}>
                <input className="input text-base" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" aria-label="Phone or email" autoComplete="email" required data-testid="pv-save-contact" />
                <button className="btn-primary shrink-0" disabled={busy === "save"} data-testid="pv-save-send">Send me the link</button>
              </form>
            </>
          )}
        </section>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn-outline" href={`/api/visit/${token}/pdf`} download data-testid="pv-pdf">Download as PDF</a>
        <button className="btn-ghost text-rec" onClick={() => setConfirmDelete(true)} data-testid="pv-delete">Delete everything</button>
      </div>
      {confirmDelete && (
        <div className="mt-3 rounded-lg border border-rec/40 bg-rec-50 p-4" role="alertdialog" aria-labelledby="pv-del-title" data-testid="pv-delete-confirm">
          <p id="pv-del-title" className="font-medium text-ink">Delete the recording, the conversation and this recap for good?</p>
          <p className="mt-1 text-sm text-ink-2">Family links and any unaccepted offer to your clinician stop working too. This can&apos;t be undone.</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-danger" disabled={busy === "delete"} onClick={() => act("delete", async () => setDeleted(await call<{ clinicianCopy: boolean }>(`/api/visit/${token}`, "DELETE")))} data-testid="pv-delete-yes">Yes, delete everything</button>
            <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert" data-testid="pv-action-error">{error}</p>}

      {!!v.transcript.length && (
        <details className="mt-6" data-testid="pv-transcript">
          <summary className="cursor-pointer text-sm font-medium text-brand">Read the whole conversation</summary>
          <div className="mt-3 space-y-2 text-sm">
            {v.transcript.map((u) => <p key={u.id}><span className="font-semibold text-ink-2">{u.speaker === "clinician" ? "Clinician" : u.speaker === "patient" ? "You" : "Someone else"}:</span> {u.text}</p>)}
          </div>
        </details>
      )}
      <p className="mt-8 text-xs text-ink-3">This page is private to you. Anyone with the link can open it, so share it only with people you trust.</p>
      <RecapFooter recorded={!declined} />
    </div>
  );
}
