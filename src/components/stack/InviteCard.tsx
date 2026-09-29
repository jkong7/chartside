"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Referral {
  url: string;
  message: string;
}

export default function InviteCard({ referral, signed, onClose }: { referral: Referral; signed: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api("/growth/prompts", { body: { prompt: "invite" } }).catch(() => undefined);
  }, []);
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ text: referral.message }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(referral.message).catch(() => undefined);
    setCopied(true);
  };
  return (
    <section className="card p-4" data-testid="invite-card">
      <p className="font-semibold">That&apos;s {signed} notes you didn&apos;t type.</p>
      <p className="mt-0.5 text-sm text-ink-2">Know someone still charting at night? Send them your link. You both get a free month when they sign their first note.</p>
      <p className="mt-3 break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs text-ink-2" data-testid="invite-url">{referral.url}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a className="btn-outline text-center" href={`sms:?&body=${encodeURIComponent(referral.message)}`} data-testid="invite-sms">Text a colleague</a>
        <button className="btn-primary" onClick={share} data-testid="invite-share">{copied ? "Copied" : "Share link"}</button>
      </div>
      <button className="mt-2 w-full text-center text-sm text-ink-3" onClick={onClose} data-testid="invite-close">Not now</button>
    </section>
  );
}
