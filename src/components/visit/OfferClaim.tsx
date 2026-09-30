"use client";

import { useEffect, useState } from "react";
import { Spinner } from "../ui";

interface Info {
  state: "open" | "claimed" | "expired" | "missing";
  visitTime?: string;
  date?: string;
  clinicianName?: string | null;
  mode?: "email" | "sms" | "npi";
  sentTo?: string | null;
  phoneConfirmed?: boolean;
  ready?: boolean;
  expiresAt?: string;
  signedIn: boolean;
  guest: boolean;
  name: string | null;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "That didn't work");
  return j as T;
}

function EmailCode({ label, hint, send, onVerified, here, button }: { label: string; hint?: string; send: (email: string) => Promise<{ email: string }>; onVerified: () => Promise<void>; here: string; button: string }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    }
    setBusy(false);
  }

  return (
    <>
      {sentTo ? (
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ mfa?: boolean }>("/api/auth/magic/verify", { email, code }); if (r.mfa) { window.location.assign(`/login?next=${encodeURIComponent(here)}`); return; } await onVerified(); }); }}>
          <label className="label" htmlFor="offer-code">Code we sent to {sentTo}</label>
          <input id="offer-code" className="input text-center font-mono text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required data-testid="offer-code" />
          <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} data-testid="offer-verify">{busy && <Spinner />} {button}</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => setSentTo((await send(email)).email)); }}>
          <label className="label" htmlFor="offer-email">{label}</label>
          <input id="offer-email" className="input text-base" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" required data-testid="offer-email" />
          <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} data-testid="offer-send">{busy && <Spinner />} Email me a code</button>
          {hint && <p className="mt-2 text-xs text-ink-3">{hint}</p>}
        </form>
      )}
      {error && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert" data-testid="offer-error">{error}</p>}
    </>
  );
}

export default function OfferClaim({ token, states, emailReady = true }: { token: string; states: { code: string; name: string }[]; emailReady?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [textSent, setTextSent] = useState<string | null>(null);
  const [textCode, setTextCode] = useState("");
  const [npi, setNpi] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/visit/c/${token}`;

  const load = () => fetch(`/api/visit/offer/${token}`, { cache: "no-store" }).then(async (r) => setInfo(await r.json()));
  useEffect(() => {
    void load();
  }, [token]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  const claim = async () => {
    const r = await post<{ next: string }>(`/api/visit/offer/${token}/claim`);
    window.location.assign(r.next);
  };

  if (!info) return <div className="flex justify-center py-24 text-brand"><Spinner /></div>;
  if (info.state !== "open") {
    return (
      <div className="card mt-8 p-6 text-center" data-testid="offer-closed" data-state={info.state}>
        <p className="font-serif text-2xl text-ink">{info.state === "expired" ? "This offer has ended" : "This link was already used"}</p>
        <p className="mt-2 text-ink-2">{info.state === "expired" ? "Offers last 7 days. Ask the patient to send a new one." : "If you accepted the draft, it's in your To review list."}</p>
        <a className="btn-primary mt-5" href="/login?next=/go/stack">Sign in</a>
      </div>
    );
  }

  const errorBox = error && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert" data-testid="offer-error">{error}</p>;
  const signedInAs = info.signedIn && <p className="text-sm text-ink-2" data-testid="offer-signed-in">Signed in as <span className="font-medium text-ink">{info.name}</span>.</p>;
  const accept = (
    <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} onClick={() => run(claim)} data-testid="offer-accept">{busy && <Spinner />} Add the draft to my To review</button>
  );

  let body: React.ReactNode;
  if (info.ready) {
    body = (
      <div data-testid="offer-ready">
        <p className="text-sm font-medium text-ok">You&apos;re confirmed.</p>
        {signedInAs}
        {accept}
        {errorBox}
      </div>
    );
  } else if (info.mode === "email") {
    body = (
      <div data-testid="offer-by-email">
        <p className="mb-3 text-sm text-ink-2">This draft was offered to <span className="font-medium text-ink" data-testid="offer-sent-to">{info.sentTo}</span>. Only that email can open it. Type the full address and we&apos;ll send a code there.</p>
        <EmailCode label="The email this offer came to" send={(email) => post<{ email: string }>(`/api/visit/offer/${token}/email`, { email })} onVerified={claim} here={here} button="Confirm and open the draft" hint="If you already use Chartside with this email, the draft lands in that account." />
      </div>
    );
  } else if (info.mode === "sms" && !info.phoneConfirmed) {
    body = (
      <div data-testid="offer-by-text">
        <p className="text-sm text-ink-2">This draft was offered by text to <span className="font-medium text-ink" data-testid="offer-sent-to">{info.sentTo}</span>. Only that phone can open it.</p>
        {textSent ? (
          <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await post(`/api/visit/offer/${token}/text/verify`, { code: textCode }); await load(); setBusy(false); }); }}>
            <label className="label" htmlFor="offer-text-code">Code we texted to {textSent}</label>
            <input id="offer-text-code" className="input text-center font-mono text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={textCode} onChange={(e) => setTextCode(e.target.value)} required data-testid="offer-text-code" />
            <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} data-testid="offer-text-verify">{busy && <Spinner />} Confirm my number</button>
            <button type="button" className="mt-2 w-full text-sm text-ink-3 underline" disabled={busy} onClick={() => run(async () => { setTextSent((await post<{ sentTo: string }>(`/api/visit/offer/${token}/text`)).sentTo); setBusy(false); })}>Text me a new code</button>
          </form>
        ) : (
          <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} onClick={() => run(async () => { setTextSent((await post<{ sentTo: string }>(`/api/visit/offer/${token}/text`)).sentTo); setBusy(false); })} data-testid="offer-text-send">{busy && <Spinner />} Text me a code</button>
        )}
        {errorBox}
      </div>
    );
  } else if (info.mode === "sms") {
    body = (
      <div data-testid="offer-text-confirmed">
        <p className="text-sm font-medium text-ok">Your number is confirmed.</p>
        {info.signedIn ? (
          <>
            {signedInAs}
            {accept}
            {errorBox}
          </>
        ) : emailReady ? (
          <>
            <p className="mb-3 mt-1 text-sm text-ink-2">Now sign in, or make a free account with your email, so the note has a home.</p>
            <EmailCode label="Your work email" send={(email) => post<{ email: string }>("/api/auth/magic", { email, next: here })} onVerified={claim} here={here} button="Sign in and open the draft" hint="Already use Chartside? Use the same email and the draft lands in your account." />
          </>
        ) : (
          <a className="btn-primary mt-3 w-full py-3 text-base" href={`/login?next=${encodeURIComponent(here)}`}>Sign in to open the draft</a>
        )}
      </div>
    );
  } else {
    body = (
      <form data-testid="offer-by-npi" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ next: string }>(`/api/visit/offer/${token}/npi`, { npi, state }); window.location.assign(r.next); }); }}>
        <p className="mb-3 text-sm text-ink-2">The patient shared this link themselves, so we check your NPI against the name they gave{info.clinicianName ? <>: <span className="font-medium text-ink" data-testid="offer-clinician-name">{info.clinicianName}</span></> : ""}. Everyone confirms this way, even if you&apos;re signed in.</p>
        {signedInAs && <div className="mb-3">{signedInAs}</div>}
        <label className="label" htmlFor="offer-npi">Your NPI</label>
        <input id="offer-npi" className="input font-mono text-base" inputMode="numeric" maxLength={10} value={npi} onChange={(e) => setNpi(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" required data-testid="offer-npi" />
        <label className="label mt-3" htmlFor="offer-state">State you practice in</label>
        <select id="offer-state" className="input text-base" value={state} onChange={(e) => setState(e.target.value)} required data-testid="offer-state">
          <option value="">Pick a state</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy || npi.length !== 10} data-testid="offer-npi-go">{busy && <Spinner />} Check my NPI and open the draft</button>
        <p className="mt-2 text-xs text-ink-3">{info.signedIn ? "The draft goes to the account you're signed in to." : "We match your NPI to the public registry and to the name the patient entered. Add your email afterward to keep the note."}</p>
        {errorBox}
      </form>
    );
  }

  return (
    <div className="mt-4" data-testid="offer-open" data-mode={info.mode}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">For clinicians</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight text-ink">A patient offered you a draft note of your {info.visitTime} visit</h1>
      <p className="mt-2 text-ink-2">{info.date}. They recorded it on their own phone with your OK. Chartside wrote a draft note you can edit and sign, free.</p>
      <p className="mt-2 text-sm text-ink-3">Confirm who you are first. We don&apos;t show anything about the patient until you do.</p>
      <div className="card mt-6 p-5">{body}</div>
      <p className="mt-6 text-xs leading-relaxed text-ink-3">Your copy becomes part of your records under your practice&apos;s rules. The patient keeps their own recap. The offer ends {info.expiresAt ? new Date(info.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "in 7 days"}. Not your visit? Just close this page.</p>
    </div>
  );
}
