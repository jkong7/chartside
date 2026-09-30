"use client";

import { useEffect, useState } from "react";
import { Spinner } from "../ui";

interface Info {
  state: "open" | "claimed" | "expired" | "missing";
  visitTime?: string;
  date?: string;
  clinicianName?: string | null;
  npiAllowed?: boolean;
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

export default function OfferClaim({ token, states }: { token: string; states: { code: string; name: string }[] }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<"email" | "npi">("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [npi, setNpi] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/visit/c/${token}`;

  useEffect(() => {
    fetch(`/api/visit/offer/${token}`, { cache: "no-store" }).then(async (r) => setInfo(await r.json()));
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

  return (
    <div className="mt-4" data-testid="offer-open">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">For clinicians</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight text-ink">A patient offered you a draft note of your {info.visitTime} visit</h1>
      <p className="mt-2 text-ink-2">{info.date}. They recorded it on their own phone with your OK. Chartside wrote a draft note you can edit and sign, free.</p>
      <p className="mt-2 text-sm text-ink-3">Confirm who you are first. We don&apos;t show anything about the patient until you do.</p>
      {info.signedIn ? (
        <div className="card mt-6 p-5">
          <p className="text-sm text-ink-2">Signed in as <span className="font-medium text-ink">{info.name}</span>.</p>
          <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} onClick={() => run(claim)} data-testid="offer-accept">{busy && <Spinner />} Add the draft to my To review</button>
        </div>
      ) : (
        <div className="card mt-6 p-5">
          {info.npiAllowed && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1 text-sm" role="tablist">
              <button role="tab" aria-selected={mode === "email"} className={`rounded-md py-1.5 font-medium ${mode === "email" ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`} onClick={() => setMode("email")} data-testid="offer-mode-email">Email code</button>
              <button role="tab" aria-selected={mode === "npi"} className={`rounded-md py-1.5 font-medium ${mode === "npi" ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`} onClick={() => setMode("npi")} data-testid="offer-mode-npi">My NPI</button>
            </div>
          )}
          {mode === "email" ? (
            sentTo ? (
              <form onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ mfa?: boolean }>("/api/auth/magic/verify", { email, code }); if (r.mfa) { window.location.assign(`/login?next=${encodeURIComponent(here)}`); return; } await claim(); }); }}>
                <label className="label" htmlFor="offer-code">Code we sent to {sentTo}</label>
                <input id="offer-code" className="input text-center font-mono text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required data-testid="offer-code" />
                <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} data-testid="offer-verify">{busy && <Spinner />} Confirm and open the draft</button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void run(async () => { setSentTo((await post<{ email: string }>("/api/auth/magic", { email, next: here })).email); setBusy(false); }); }}>
                <label className="label" htmlFor="offer-email">Your work email</label>
                <input id="offer-email" className="input text-base" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" required data-testid="offer-email" />
                <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy} data-testid="offer-send">{busy && <Spinner />} Email me a code</button>
                <p className="mt-2 text-xs text-ink-3">Already use Chartside? Use the same email and the draft lands in your account.</p>
              </form>
            )
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ next: string }>(`/api/visit/offer/${token}/npi`, { npi, state }); window.location.assign(r.next); }); }}>
              <label className="label" htmlFor="offer-npi">Your NPI</label>
              <input id="offer-npi" className="input font-mono text-base" inputMode="numeric" maxLength={10} value={npi} onChange={(e) => setNpi(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" required data-testid="offer-npi" />
              <label className="label mt-3" htmlFor="offer-state">State you practice in</label>
              <select id="offer-state" className="input text-base" value={state} onChange={(e) => setState(e.target.value)} required data-testid="offer-state">
                <option value="">Pick a state</option>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              <button className="btn-primary mt-3 w-full py-3 text-base" disabled={busy || npi.length !== 10} data-testid="offer-npi-go">{busy && <Spinner />} Check my NPI and open the draft</button>
              <p className="mt-2 text-xs text-ink-3">We match your NPI to the public registry and to the name the patient entered. Add your email afterward to keep the note.</p>
            </form>
          )}
          {error && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert" data-testid="offer-error">{error}</p>}
        </div>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-3">Your copy becomes part of your records under your practice&apos;s rules. The patient keeps their own recap. The offer ends {info.expiresAt ? new Date(info.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "in 7 days"}. Not your visit? Just close this page.</p>
    </div>
  );
}
