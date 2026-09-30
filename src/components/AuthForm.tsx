"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Logo, Shield } from "./icons";
import { Spinner } from "./ui";
import { ProviderButtons } from "./RegisterForm";

interface InviteInfo {
  token: string;
  email: string;
  orgName: string;
  role: string;
}

interface SsoInfo {
  sso: boolean;
  required: boolean;
  orgName: string | null;
}

export default function AuthForm({ mode, next, invite, error: initialError, providers = [] }: { mode: "login" | "register"; next?: string; invite?: InviteInfo; error?: string; providers?: { id: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sso, setSso] = useState<SsoInfo | null>(null);
  const [ssoMode, setSsoMode] = useState(false);
  const [email, setEmail] = useState(invite?.email ?? "");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const passwordless = mode === "login" && (ssoMode || !!sso?.required);

  async function lookup(value: string) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return setSso(null);
    try {
      setSso(await api<SsoInfo>(`/auth/sso?email=${encodeURIComponent(value)}`));
    } catch {
      setSso(null);
    }
  }

  async function startSso() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/auth/sso", { body: { email, next } });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Single sign-on is unavailable");
      setBusy(false);
    }
  }

  async function emailCode() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Enter your email first");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string }>("/auth/magic", { body: { email, next } });
      setCodeSent(r.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
      if (err instanceof Error && /single sign-on/i.test(err.message)) lookup(email);
    }
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mfa?: boolean; challenge?: string; next: string }>("/auth/magic/verify", { body: { email, code: new FormData(e.currentTarget).get("code") } });
      if (r.mfa && r.challenge) {
        setCodeSent(null);
        setChallenge(r.challenge);
        setBusy(false);
        return;
      }
      window.location.assign(next ?? r.next ?? "/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (passwordless) return startSso();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        await api("/auth/mfa", { body: { challenge, code: f.get("code") } });
      } else {
        const r = await api<{ mfa?: boolean; challenge?: string }>(`/auth/${mode}`, {
          body: mode === "login"
            ? { email, password: f.get("password") }
            : { email, password: f.get("password"), name: f.get("name"), specialty: f.get("specialty"), orgName: f.get("orgName") || undefined, demo: f.get("demo") === "on", invite: invite?.token },
        });
        if (r.mfa && r.challenge) {
          setChallenge(r.challenge);
          setBusy(false);
          return;
        }
      }
      if (next) window.location.assign(next);
      else {
        router.push("/today");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
      if (challenge && err instanceof Error && /expired/i.test(err.message)) setChallenge(null);
      if (mode === "login" && !challenge) lookup(email);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo />
          <span className="font-serif text-2xl">Chartside</span>
        </Link>
        {codeSent ? (
          <form onSubmit={submitCode} className="card space-y-4 p-6 shadow-sm" data-testid="magic-code-form">
            <div>
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="mt-1 text-sm text-ink-3">We sent a 6-digit code to {codeSent}. It expires in 10 minutes.</p>
            </div>
            <input className="input text-center font-mono text-lg tracking-widest" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required aria-label="Sign-in code" data-testid="magic-code" />
            {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
            <button className="btn-primary w-full" disabled={busy} type="submit" data-testid="magic-submit">{busy && <Spinner />} Sign in</button>
            <button type="button" className="w-full text-center text-sm text-brand" onClick={() => { setCodeSent(null); setError(null); }}>Back</button>
          </form>
        ) : challenge ? (
          <form onSubmit={submit} className="card space-y-4 p-6 shadow-sm" data-testid="mfa-form">
            <div>
              <h1 className="text-lg font-semibold">Two-step verification</h1>
              <p className="mt-1 text-sm text-ink-3">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
            </div>
            <input className="input text-center font-mono text-lg tracking-widest" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required aria-label="Verification code" data-testid="mfa-code" />
            {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
            <button className="btn-primary w-full" disabled={busy} type="submit" data-testid="mfa-submit">{busy && <Spinner />} Verify</button>
            <button type="button" className="w-full text-center text-sm text-brand" onClick={() => { setChallenge(null); setError(null); }}>Back</button>
          </form>
        ) : (
        <form onSubmit={submit} className="card space-y-4 p-6 shadow-sm">
          {next?.startsWith("/smart/") && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand">Sign in to continue launching Chartside from your EHR.</p>}
          {invite && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand" data-testid="invite-banner">You&apos;ve been invited to join <b>{invite.orgName}</b> as {invite.role}.</p>}
          <div>
            <h1 className="text-lg font-semibold">{mode === "login" ? "Sign in" : invite ? "Create your account" : "Create your clinician account"}</h1>
            <p className="mt-1 text-sm text-ink-3">{mode === "login" ? "Welcome back." : invite ? "Set a name and password to join your team." : "Your workspace comes with a demo clinic day you can record against."}</p>
          </div>
          {mode === "login" && !passwordless && <ProviderButtons providers={providers} next={next} />}
          {mode === "register" && (
            <>
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input className="input" id="name" name="name" placeholder="Dr. Avery Chen" required autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="specialty">Specialty</label>
                <select className="input" id="specialty" name="specialty" defaultValue="Family Medicine">
                  {["Family Medicine", "Internal Medicine", "Pediatrics", "Psychiatry", "Psychotherapy", "Physical Therapy", "Occupational Therapy", "Speech-Language Pathology", "Chiropractic", "Emergency Medicine", "Hospital Medicine", "Oncology", "Obstetrics and Gynecology", "Urgent Care", "Other"].map((sp) => (
                    <option key={sp} value={sp}>{sp}</option>
                  ))}
                </select>
              </div>
              {!invite && (
                <div>
                  <label className="label" htmlFor="orgName">Practice or organization</label>
                  <input className="input" id="orgName" name="orgName" placeholder="Lakeside Family Medicine" autoComplete="organization" />
                </div>
              )}
            </>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" value={email} readOnly={!!invite} onChange={(e) => setEmail(e.target.value)} onBlur={() => mode === "login" && lookup(email)} />
          </div>
          {!passwordless && (
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input className="input" id="password" name="password" type="password" required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </div>
          )}
          {mode === "login" && sso?.required && <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2" data-testid="sso-required">{sso.orgName} signs in with single sign-on.</p>}
          {mode === "register" && !invite && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="demo" defaultChecked className="accent-brand" />
              Load a demo schedule and two weeks of history
            </label>
          )}
          {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy && <Spinner />}
            {passwordless ? <><Shield /> Continue with {sso?.orgName ?? "SSO"}</> : mode === "login" ? "Sign in" : invite ? `Join ${invite.orgName}` : "Create account"}
          </button>
          {mode === "login" && !passwordless && (
            <button type="button" className="btn-outline w-full" data-testid="sso-button" onClick={() => (sso?.sso ? startSso() : setSsoMode(true))} disabled={busy}>
              <Shield /> {sso?.sso ? `Sign in with ${sso.orgName} SSO` : "Sign in with SSO"}
            </button>
          )}
          {mode === "login" && !passwordless && (
            <button type="button" className="btn-outline w-full" data-testid="magic-button" onClick={emailCode} disabled={busy}>Email me a sign-in code</button>
          )}
          {mode === "login" && ssoMode && !sso?.required && <button type="button" className="w-full text-center text-sm text-brand" onClick={() => setSsoMode(false)}>Use a password instead</button>}
          <p className="text-center text-sm text-ink-3">
            {mode === "login" ? (<>New to Chartside? <Link className="font-medium text-brand" href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}>Create an account</Link></>) : (<>Already have an account? <Link className="font-medium text-brand" href={invite ? `/login?next=${encodeURIComponent(`/invite/${invite.token}`)}` : "/login"}>Sign in</Link></>)}
          </p>
        </form>
        )}
      </div>
    </main>
  );
}
