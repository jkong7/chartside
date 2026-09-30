"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { SPECIALTIES } from "@/lib/engine/specialty";
import { Check, Logo } from "./icons";
import { Spinner } from "./ui";

export interface NpiMatch {
  name: string;
  credential: string;
  specialty: string;
  taxonomy: string;
  state: string;
  template: string;
}

export function ProviderButtons({ providers, next, hint }: { providers: { id: string; label: string }[]; next?: string; hint?: string }) {
  if (!providers.length) return null;
  const href = (id: string) => `/api/auth/oauth/${id}?${new URLSearchParams({ ...(next ? { next } : {}), ...(hint ? { hint } : {}) }).toString()}`;
  return (
    <div className="space-y-2" data-testid="provider-buttons">
      {providers.map((p) => (
        <a key={p.id} className="btn-outline w-full justify-center" href={href(p.id)} data-testid={`oauth-${p.id}`}>
          {p.id === "google" ? <GoogleMark /> : <MicrosoftMark />} Continue with {p.label}
        </a>
      ))}
      <p className="flex items-center gap-3 py-1 text-xs text-ink-3"><span className="h-px flex-1 bg-line" />or use your email<span className="h-px flex-1 bg-line" /></p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export function NpiField({ value, onChange, onMatch, id = "npi", compact = false }: { value: string; onChange: (v: string) => void; onMatch: (m: NpiMatch | null) => void; id?: string; compact?: boolean }) {
  const [match, setMatch] = useState<NpiMatch | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const asked = useRef("");

  async function lookup(v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length !== 10) {
      if (match) onMatch(null);
      setMatch(null);
      setMsg(null);
      asked.current = "";
      return;
    }
    if (asked.current === digits) return;
    asked.current = digits;
    setMsg(null);
    setLooking(true);
    try {
      const r = await api<NpiMatch>(`/auth/npi?npi=${digits}`);
      setMatch(r);
      onMatch(r);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "We couldn't look up that NPI");
      setMatch(null);
      onMatch(null);
    }
    setLooking(false);
  }

  return (
    <div>
      <label className={compact ? "text-sm text-ink-2" : "label"} htmlFor={id}>NPI <span className="font-normal text-ink-3">(optional, fills in the rest)</span></label>
      <input className="input mt-1 font-mono" id={id} name="npi" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="10 digits" value={value} onChange={(e) => { onChange(e.target.value); lookup(e.target.value); }} data-testid={`${id}-input`} />
      {looking && <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><Spinner /> Looking up your NPI</p>}
      {msg && <p className="mt-1 text-xs text-warn" role="status">{msg}</p>}
      {match && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-ok-50 px-3 py-2 text-xs text-ok" data-testid="npi-verified">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Found in the national NPI registry: {match.name}{match.credential ? `, ${match.credential}` : ""}, {match.taxonomy}{match.state ? `, ${match.state}` : ""}. We&apos;ll start you on the {match.template} template.</span>
        </p>
      )}
    </div>
  );
}

export default function RegisterForm({ next, providers }: { next?: string; providers: { id: string; label: string }[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [npi, setNpi] = useState("");
  const [specialty, setSpecialty] = useState<string>("Family Medicine");
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string }>("/auth/register", { body: { name, email, npi: npi.replace(/\D/g, "") || undefined, specialty, demo, next } });
      setSentTo(r.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mfa?: boolean; next: string }>("/auth/magic/verify", { body: { email, code: new FormData(e.currentTarget).get("code") } });
      if (r.mfa) {
        window.location.assign(`/login?next=${encodeURIComponent(next ?? r.next ?? "/go")}`);
        return;
      }
      window.location.assign(r.next || next || "/go");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo />
          <span className="font-serif text-2xl">Chartside</span>
        </Link>
        {sentTo ? (
          <form onSubmit={verify} className="card space-y-4 p-6 shadow-sm" data-testid="register-code-form">
            <div>
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="mt-1 text-sm text-ink-3">We sent a 6-digit code to {sentTo}. Type it here, or tap the link in the email. It expires in 10 minutes.</p>
            </div>
            <input className="input text-center font-mono text-lg tracking-widest" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required aria-label="6-digit code" data-testid="register-code" />
            {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
            <button className="btn-primary w-full" disabled={busy} type="submit" data-testid="register-verify">{busy && <Spinner />} Create my account</button>
            <button type="button" className="w-full text-center text-sm text-brand" onClick={() => { setSentTo(null); setError(null); }}>Use a different email</button>
          </form>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6 shadow-sm" data-testid="register-form">
            <div>
              <h1 className="text-lg font-semibold">Create your free account</h1>
              <p className="mt-1 text-sm text-ink-3">No password to remember. We&apos;ll email you a code.</p>
            </div>
            <ProviderButtons providers={providers} next={next} />
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input className="input" id="name" name="name" placeholder="Avery Chen" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <NpiField value={npi} onChange={setNpi} onMatch={(m) => { if (!m) return; setName(`${m.name}${m.credential ? `, ${m.credential}` : ""}`); setSpecialty(m.specialty); }} />
            <div>
              <label className="label" htmlFor="specialty">Specialty</label>
              <select className="input" id="specialty" name="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} data-testid="register-specialty">
                {SPECIALTIES.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="accent-brand" data-testid="register-demo" />
              Add a sample clinic day with example patients
            </label>
            {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
            <button className="btn-primary w-full" disabled={busy} type="submit" data-testid="register-submit">{busy && <Spinner />} Email me a code</button>
            <p className="text-center text-sm text-ink-3">Already have an account? <Link className="font-medium text-brand" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</Link></p>
            <p className="text-center text-xs text-ink-3">Just looking? <Link className="font-medium text-brand" href="/go/phone?autopilot=1">Hear a sample call first</Link>, no account needed.</p>
          </form>
        )}
      </div>
    </main>
  );
}
