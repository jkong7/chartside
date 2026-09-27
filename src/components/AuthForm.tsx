"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "./icons";
import { Spinner } from "./ui";

export default function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        body: mode === "login"
          ? { email: f.get("email"), password: f.get("password") }
          : { email: f.get("email"), password: f.get("password"), name: f.get("name"), specialty: f.get("specialty"), demo: f.get("demo") === "on" },
      });
      if (next) window.location.assign(next);
      else {
        router.push("/today");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
        <form onSubmit={submit} className="card space-y-4 p-6 shadow-sm">
          {next?.startsWith("/smart/") && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand">Sign in to continue launching Chartside from your EHR.</p>}
          <div>
            <h1 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your clinician account"}</h1>
            <p className="mt-1 text-sm text-ink-3">{mode === "login" ? "Welcome back." : "Your workspace comes with a demo clinic day you can record against."}</p>
          </div>
          {mode === "register" && (
            <>
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input className="input" id="name" name="name" placeholder="Dr. Avery Chen" required autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="specialty">Specialty</label>
                <input className="input" id="specialty" name="specialty" placeholder="Family Medicine" defaultValue="Family Medicine" />
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
          {mode === "register" && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="demo" defaultChecked className="accent-brand" />
              Load a demo schedule and two weeks of history
            </label>
          )}
          {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy && <Spinner />}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
          <p className="text-center text-sm text-ink-3">
            {mode === "login" ? (<>New to Chartside? <Link className="font-medium text-brand" href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}>Create an account</Link></>) : (<>Already have an account? <Link className="font-medium text-brand" href="/login">Sign in</Link></>)}
          </p>
        </form>
      </div>
    </main>
  );
}
