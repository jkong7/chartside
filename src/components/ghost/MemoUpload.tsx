"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function MemoUpload({ client: signedInClient, signedIn }: { client: "patient" | "client"; signedIn: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [client, setClient] = useState(signedInClient);
  const [checked, setChecked] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<"pick" | "sending" | "drafting" | "ready" | "failed">("pick");
  const [enc, setEnc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const t = h.get("t");
    if (t && /^cs_cap_[\w-]{32,}$/.test(t)) {
      setToken(t);
      if (h.get("c") === "client" || h.get("c") === "patient") setClient(h.get("c") as "client" | "patient");
      window.history.replaceState(null, "", window.location.pathname);
    }
    setChecked(true);
  }, []);

  const headers: HeadersInit | undefined = token ? { authorization: `Bearer ${token}` } : undefined;

  const send = async () => {
    if (!picked || !agreed) return;
    setPhase("sending");
    setError(null);
    const form = new FormData();
    form.set("audio", picked, picked.name);
    form.set("consent", "granted");
    form.set("channel", "upload-link");
    const r = await fetch("/api/capture", { method: "POST", body: form, headers }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setError(j.error || "Upload failed. Check your connection and try again.");
      setPhase("failed");
      return;
    }
    setEnc(j.encounterId);
    setPhase("drafting");
    for (let i = 0; i < 200; i++) {
      const s = await (await fetch(`/api/capture/${j.encounterId}`, { headers })).json().catch(() => ({}));
      if (s.status === "ready" || s.status === "signed") return setPhase("ready");
      if (s.status === "failed") {
        setError(s.error || "We couldn't write the note");
        return setPhase("failed");
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
  };

  if (checked && !token && !signedIn) {
    return (
      <div className="card mx-auto w-full max-w-md p-6" data-testid="memo-upload-invalid">
        <p className="label">Upload a recording</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">This upload link has expired.</h1>
        <p className="mt-2 text-sm text-ink-2">Upload links work once. Text UPLOAD to the Chartside line for a new one, or sign in to upload.</p>
        <Link href="/login?next=%2Fgo%2Fupload" className="btn-primary mt-5 w-full py-3 text-base">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="card mx-auto w-full max-w-md p-6" data-testid="memo-upload" data-phase={phase}>
      <p className="label">Upload a recording</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Too big to text? Send it here.</h1>
      <p className="mt-2 text-sm text-ink-2">Pick a voice memo or any audio file up to 100 MB. Chartside stores it encrypted, and your note is ready in about a minute.</p>
      {(phase === "pick" || phase === "failed") && (
        <div className="mt-5 space-y-4">
          <input ref={file} id="memo-file" type="file" accept="audio/*,video/3gpp,video/mp4,.m4a,.amr,.3gp,.caf" className="sr-only" onChange={(e) => setPicked(e.target.files?.[0] ?? null)} data-testid="memo-file" />
          <label htmlFor="memo-file" className="btn-outline w-full cursor-pointer py-3 text-base">
            {picked ? "Choose a different file" : "Choose a recording"}
          </label>
          {picked && (
            <p className="text-sm text-ink" data-testid="memo-picked">
              {picked.name} · {(picked.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="memo-consent" />
            <span>My {client} agreed to be recorded.</span>
          </label>
          <button className="btn-primary w-full py-3 text-base" disabled={!picked || !agreed} onClick={send} data-testid="memo-send">
            Write the note
          </button>
          {error && <p className="text-sm text-rec" role="alert">{error}</p>}
        </div>
      )}
      {phase === "sending" && <p className="mt-5 text-ink">Uploading…</p>}
      {phase === "drafting" && <p className="mt-5 text-ink">Writing your note…</p>}
      {phase === "ready" && enc && token && (
        <p className="mt-5 rounded-lg bg-ok-50 p-3 text-sm text-ok" role="status" data-testid="memo-done">Your note is written. We texted you a link to review and sign it.</p>
      )}
      {phase === "ready" && enc && !token && (
        <Link href={`/go/stack?focus=${encodeURIComponent(enc)}`} className="btn-primary mt-5 w-full py-3 text-base" data-testid="memo-review">
          Review and sign
        </Link>
      )}
    </div>
  );
}
