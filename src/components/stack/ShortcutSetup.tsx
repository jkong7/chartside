"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "../icons";
import { Spinner } from "../ui";

function Copy({ text, label, testid }: { text: string; label: string; testid: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn-outline px-3 py-1 text-xs" onClick={async () => { await navigator.clipboard?.writeText(text).catch(() => undefined); setDone(true); }} data-testid={testid}>{done ? "Copied" : label}</button>;
}

export default function ShortcutSetup({ origin: serverOrigin, state }: { origin: string; state: string }) {
  const [origin, setOrigin] = useState(serverOrigin);
  const [token, setToken] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    if (/localhost|0\.0\.0\.0/.test(serverOrigin)) setOrigin(window.location.origin);
  }, [serverOrigin]);

  const url = `${origin}/api/capture?consent=granted&state=${state}&channel=shortcut`;
  const curl = `curl -X POST '${url}' \\\n  -H 'Authorization: Bearer ${token ?? "cs_cap_…"}' \\\n  -F 'audio=@"Visit.m4a"'`;

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; expiresAt: string }>("/capture/token", { body: { device: true, label: "iPhone Shortcut" } });
      setToken(r.token);
      setExpires(r.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a token");
    }
    setBusy(false);
  }

  const step = (n: number, title: string, body: React.ReactNode) => (
    <li className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Step {n}</p>
      <p className="mt-0.5 font-semibold">{title}</p>
      <div className="mt-1 space-y-1 text-sm text-ink-2">{body}</div>
    </li>
  );

  return (
    <main className="min-h-screen bg-paper pb-12" data-ready={ready ? "true" : undefined} data-testid="shortcut-setup">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Logo />
          <h1 className="flex-1 text-sm font-semibold">Send to Chartside from your iPhone</h1>
          <a className="text-sm font-medium text-brand" href="/go/settings">Settings</a>
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <p className="text-sm text-ink-2">Record the visit in Voice Memos, which keeps recording with the screen locked. When you&apos;re done, share the memo to this Shortcut. Your note is ready a minute later.</p>
        <section className="card border-brand p-4" data-testid="shortcut-token-card">
          <p className="font-semibold">Your Shortcut key</p>
          {token ? (
            <>
              <p className="mt-1 text-sm text-ink-2">Copy it now. It&apos;s shown once and works for 30 days{expires ? `, until ${new Date(expires).toLocaleDateString("en-US")}` : ""}. It can upload recordings and nothing else. Disconnect it any time in Settings.</p>
              <p className="mt-2 break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs" data-testid="shortcut-token">{token}</p>
              <div className="mt-2"><Copy text={token} label="Copy key" testid="copy-token" /></div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-2">The Shortcut needs a key to upload to your account.</p>
              <button className="btn-primary mt-3 w-full" onClick={mint} disabled={busy} data-testid="shortcut-mint">{busy && <Spinner />} Create my key</button>
            </>
          )}
          {error && <p className="mt-2 text-sm text-rec" role="alert">{error}</p>}
        </section>
        <ol className="space-y-3">
          {step(1, "Create the Shortcut", <><p>Open the Shortcuts app, tap +, and name it <b>Send to Chartside</b>.</p><p>Tap the info button and turn on <b>Show in Share Sheet</b>. Set it to receive <b>Media</b> and <b>Files</b>.</p></>)}
          {step(2, "Ask about consent", <><p>Add <b>Choose from Menu</b> with the prompt <b>Did the patient agree to recording?</b> and two options, <b>Yes</b> and <b>No</b>.</p><p>Under <b>No</b>, add <b>Stop This Shortcut</b>. Put the next steps under <b>Yes</b>.</p></>)}
          {step(3, "Upload the memo", <>
            <p>Add <b>Get Contents of URL</b> and set:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>URL: <span className="break-all font-mono text-xs" data-testid="shortcut-url">{url}</span> <Copy text={url} label="Copy" testid="copy-url" /></li>
              <li>Method: <b>POST</b></li>
              <li>Headers: <b>Authorization</b> = <span className="font-mono text-xs">Bearer</span> followed by a space and your key</li>
              <li>Request Body: <b>Form</b>, add a <b>File</b> field named <b>audio</b> set to <b>Shortcut Input</b></li>
            </ul>
          </>)}
          {step(4, "Open the note", <><p>Add <b>Get Dictionary Value</b> for the key <b>encounterId</b> from Contents of URL, then <b>Open URLs</b> with <span className="break-all font-mono text-xs">{origin}/go/stack?focus=</span> followed by that value.</p><p>Chartside drafts the note in about a minute. The page shows it when it&apos;s ready.</p></>)}
          {step(5, "Put it on the Action button (optional)", <><p>On iPhone 15 Pro or later: Settings, Action Button, Shortcut, then pick <b>Voice Memos</b> to start recording in one press. Share the memo to <b>Send to Chartside</b> when the visit ends.</p></>)}
          {step(6, "Keep the recording private", <><p>After the upload, delete the memo in Voice Memos.</p><p>Turn off iCloud sync for Voice Memos: Settings, your name, iCloud, then turn off <b>Voice Memos</b>. Apple doesn&apos;t sign a HIPAA agreement for personal iCloud.</p></>)}
        </ol>
        <section className="card p-4" data-testid="shortcut-curl-card">
          <p className="font-semibold">Test it from a computer</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-sunken p-3 font-mono text-xs" tabIndex={0} aria-label="Test command" data-testid="shortcut-curl">{curl}</pre>
          <div className="mt-2"><Copy text={curl} label="Copy command" testid="copy-curl" /></div>
        </section>
      </div>
    </main>
  );
}
