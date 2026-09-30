"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "../ui";

const TZ_STATE: Record<string, string> = { "America/Los_Angeles": "CA", "America/Denver": "CO", "America/Phoenix": "AZ", "America/Chicago": "IL", "America/New_York": "NY", "America/Detroit": "MI", "America/Anchorage": "AK", "Pacific/Honolulu": "HI", "America/Boise": "ID", "America/Indiana/Indianapolis": "IN", "America/Kentucky/Louisville": "KY" };

export default function VisitStart({ states }: { states: { code: string; name: string; allParty: boolean }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const guess = TZ_STATE[Intl.DateTimeFormat().resolvedOptions().timeZone];
      if (guess) setState((s) => s || guess);
    } catch {
      return;
    }
  }, []);
  const picked = states.find((s) => s.code === state);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patientName: name, state }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setError(j.error ?? "Couldn't start. Check your connection and try again.");
      setBusy(false);
      return;
    }
    router.push(`/visit/r/${j.token}`);
  }

  return (
    <form onSubmit={start} className="card self-start p-6 shadow-sm" data-testid="visit-start">
      <h2 className="font-serif text-2xl font-semibold text-ink">Ready when you are</h2>
      <label className="label mt-5" htmlFor="pv-name">Your first name (optional)</label>
      <input id="pv-name" className="input text-base" autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="So your clinician knows who's asking" data-testid="visit-name" />
      <label className="label mt-4" htmlFor="pv-state">Which state are you in?</label>
      <select id="pv-state" className="input text-base" value={state} onChange={(e) => setState(e.target.value)} required data-testid="visit-state">
        <option value="">Pick your state</option>
        {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </select>
      {picked?.allParty && <p className="mt-2 text-sm text-ink-3" data-testid="visit-all-party-hint">{picked.name} needs everyone in the room to agree. We&apos;ll ask on the next screen.</p>}
      <button className="btn-primary mt-6 w-full py-3 text-base" disabled={busy || !state} data-testid="visit-record">{busy && <Spinner />} Record my visit</button>
      <p className="mt-3 text-center text-xs text-ink-3">Nothing is recorded until your clinician taps Agree.</p>
      {error && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
    </form>
  );
}
