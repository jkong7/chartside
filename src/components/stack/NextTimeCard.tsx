"use client";

import { useState } from "react";

export default function NextTimeCard({ hasPhone, onClose }: { hasPhone: boolean; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const savePin = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/auth/phone/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: "PIN set. Next call, enter it to hear your schedule." } : { ok: false, text: j.error || "Couldn't set the PIN" });
    if (r?.ok) setPin("");
  };

  return (
    <section className="card border-brand/30 p-5" data-testid="next-time">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand">Saved</p>
          <h2 className="mt-1 font-serif text-xl font-semibold">Next time, just call.</h2>
        </div>
        <button className="text-sm text-ink-3" onClick={onClose} aria-label="Close">Close</button>
      </div>
      <ol className="mt-3 space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="font-mono text-ink-3">1</span>
          <span>
            Put the line in your phone.{" "}
            <a className="font-medium text-brand underline" href="/line/contact.vcf" data-testid="next-contact">Save Chartside to contacts</a>
          </span>
        </li>
        {hasPhone && (
          <li className="flex gap-3">
            <span className="font-mono text-ink-3">2</span>
            <span className="flex-1">
              Set a phone PIN so the line can read you your schedule.
              <span className="mt-2 flex gap-2">
                <input className="input max-w-[9rem] font-mono" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="4 to 6 digits" aria-label="Phone PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} data-testid="next-pin" />
                <button className="btn-primary" disabled={busy || pin.length < 4} onClick={savePin} data-testid="next-pin-save">Set PIN</button>
              </span>
              {msg && <span className={`mt-1 block text-xs ${msg.ok ? "text-ok" : "text-rec"}`} role="status" data-testid="next-pin-msg">{msg.text}</span>}
            </span>
          </li>
        )}
        <li className="flex gap-3">
          <span className="font-mono text-ink-3">{hasPhone ? 3 : 2}</span>
          <span>Text STATUS to the line any time to see what&apos;s waiting. Texts never include patient details.</span>
        </li>
      </ol>
    </section>
  );
}
