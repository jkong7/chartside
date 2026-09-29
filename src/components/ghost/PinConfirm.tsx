"use client";

import Link from "next/link";
import { useState } from "react";

export default function PinConfirm({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  const [msg, setMsg] = useState("");
  const confirm = async () => {
    setState("busy");
    const r = await fetch("/api/voice/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) setState("done");
    else {
      setMsg(j.reason || "Something went wrong. Try again from your next call.");
      setState("error");
    }
  };
  return (
    <div className="card mx-auto w-full max-w-md p-6" data-testid="pin-confirm" data-state={state}>
      <p className="label">Chartside Line</p>
      {state === "done" ? (
        <>
          <h1 className="font-serif text-2xl font-semibold text-ink">Your phone PIN is on.</h1>
          <p className="mt-2 text-ink-2">Next call, enter it to hear your schedule and ask about your chart.</p>
          <Link href="/line/card" className="btn-outline mt-5">Print a pocket card</Link>
        </>
      ) : state === "error" ? (
        <p className="text-rec" role="alert">{msg}</p>
      ) : (
        <>
          <h1 className="font-serif text-2xl font-semibold text-ink">Turn on the PIN you chose on your call?</h1>
          <p className="mt-2 text-sm text-ink-2">If you didn&apos;t just set a PIN on a Chartside call, close this page.</p>
          <button className="btn-primary mt-5 w-full py-3 text-base" onClick={confirm} disabled={state === "busy"} data-testid="pin-confirm-go">
            Turn on my PIN
          </button>
        </>
      )}
    </div>
  );
}
