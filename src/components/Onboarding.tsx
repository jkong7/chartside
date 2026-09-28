"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { OnboardingItem } from "@/lib/server/onboarding";
import { Check, X } from "./icons";

export default function Onboarding({ items }: { items: OnboardingItem[] }) {
  const [hidden, setHidden] = useState(false);
  const done = items.filter((i) => i.done).length;
  if (hidden || done === items.length) return null;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-6 md:px-8" data-testid="onboarding">
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm font-semibold">Getting started · {done} of {items.length}</p>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-brand" style={{ width: `${(done / items.length) * 100}%` }} /></div>
          <button className="btn-ghost px-2 text-xs" onClick={async () => { setHidden(true); await api("/auth/me", { method: "PATCH", body: { prefs: { onboardingDismissed: true } } }); }} aria-label="Dismiss" data-testid="onboarding-dismiss"><X size={12} /></button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key} data-testid="onboarding-item" data-done={i.done}>
              <Link href={i.href} className={`flex gap-2.5 rounded-lg border p-3 text-sm ${i.done ? "border-line text-ink-3" : "border-brand/30 hover:bg-brand-50"}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${i.done ? "border-ok bg-ok text-white" : "border-line"}`}>{i.done && <Check size={10} />}</span>
                <span><span className={`font-medium ${i.done ? "line-through" : ""}`}>{i.label}</span><span className="mt-0.5 block text-xs text-ink-3">{i.detail}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
