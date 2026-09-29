"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "../icons";
import { Spinner } from "../ui";

interface Props {
  user: { name: string; email: string; phone: string | null; prefs?: { clinicNudgeHour?: number | null; textOptOut?: boolean } };
  growth: { referral: { url: string; message: string }; credits: { months: number; fromReferrals: number; cap: number; capped: boolean }; npi: { number: string; name: string; matched: boolean; reason: string | null } | null; signed: number };
  receipt: { notesSigned: number; hoursBack: number; closedSameDay: number; medianMinutesToSign: number | null };
  pinSet: boolean;
  devices: { id: string; label: string; expiresAt: string; lastUsedAt: string | null }[];
}

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id: string }) {
  return (
    <section className="card p-4" aria-labelledby={`${id}-h`} data-testid={`settings-${id}`}>
      <h2 id={`${id}-h`} className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-3">{hint}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "That didn't work" });
    }
    setBusy(false);
  };
  const note = msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-rec"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>;
  return { busy, run, note };
}

function Phone({ initial, onVerified }: { initial: string | null; onVerified: (p: string) => void }) {
  const [phone, setPhone] = useState(initial);
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const a = useAction();
  return (
    <Section id="phone" title="Your phone" hint="Calls from this number go to your account. Texts carry no patient details, only a sign-in link.">
      {phone && <p className="text-sm">Verified: <span className="font-mono" data-testid="phone-current">{phone}</span></p>}
      {!sent ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); a.run(async () => { const r = await api<{ phone: string }>("/auth/phone", { body: { phone: value } }); setSent(true); return `Code sent to ${r.phone}`; }); }}>
          <label className="sr-only" htmlFor="phone-input">Mobile number</label>
          <input id="phone-input" className="input flex-1" type="tel" inputMode="tel" autoComplete="tel" placeholder="(312) 555-0101" value={value} onChange={(e) => setValue(e.target.value)} required data-testid="phone-input" />
          <button className="btn-primary" disabled={a.busy} data-testid="phone-send">{a.busy && <Spinner />} {phone ? "Change" : "Verify"}</button>
        </form>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); a.run(async () => { const r = await api<{ phone: string }>("/auth/phone/verify", { body: { code } }); setPhone(r.phone); onVerified(r.phone); setSent(false); setCode(""); return "Phone verified"; }); }}>
          <label className="sr-only" htmlFor="phone-code">Code from the text</label>
          <input id="phone-code" className="input flex-1 text-center font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required data-testid="phone-code" />
          <button className="btn-primary" disabled={a.busy} data-testid="phone-verify">{a.busy && <Spinner />} Confirm</button>
        </form>
      )}
      {a.note}
    </Section>
  );
}

function Pin({ initial }: { initial: boolean }) {
  const [set, setSet] = useState(initial);
  const [pin, setPin] = useState("");
  const a = useAction();
  return (
    <Section id="pin" title="Call PIN" hint="Enter it on a call to hear your schedule and ask about your patients. Without it, a call only records.">
      <p className="text-sm" data-testid="pin-status">{set ? "A PIN is set." : "No PIN yet."}</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api("/auth/phone/pin", { body: { pin } }); setSet(true); setPin(""); return "PIN saved"; }); }}>
        <label className="sr-only" htmlFor="pin-input">New PIN, 4 to 6 digits</label>
        <input id="pin-input" className="input flex-1 text-center font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" placeholder="4 to 6 digits" value={pin} onChange={(e) => setPin(e.target.value)} required data-testid="pin-input" />
        <button className="btn-primary" disabled={a.busy} data-testid="pin-save">{a.busy && <Spinner />} {set ? "Change" : "Set"}</button>
      </form>
      {a.note}
    </Section>
  );
}

const hourLabel = (h: number) => `${h === 12 ? 12 : h - 12} PM`;

function Nudge({ initial, hasPhone }: { initial: number | null; hasPhone: boolean }) {
  const [hour, setHour] = useState<number | null>(initial);
  const a = useAction();
  const save = (h: number | null) => a.run(async () => {
    await api("/auth/me", { method: "PATCH", body: { prefs: { clinicNudgeHour: h } } });
    setHour(h);
    return h === null ? "End-of-clinic text off" : `We'll text you at ${hourLabel(h)} if notes are waiting`;
  });
  return (
    <Section id="nudge" title="End-of-clinic text" hint="One text a day if notes are still waiting, with a link to your stack. No patient details.">
      {!hasPhone && <p className="text-sm text-ink-3">Verify your phone above to turn this on.</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" checked={hour !== null} disabled={!hasPhone || a.busy} onChange={(e) => save(e.target.checked ? hour ?? 17 : null)} data-testid="nudge-toggle" />
        Text me when notes are waiting
      </label>
      {hour !== null && (
        <label className="flex items-center gap-2 text-sm">
          <span>At</span>
          <select className="input w-auto" value={hour} disabled={a.busy} onChange={(e) => save(Number(e.target.value))} data-testid="nudge-hour" aria-label="Time for the end-of-clinic text">
            {Array.from({ length: 9 }, (_, i) => 12 + i).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </label>
      )}
      {a.note}
    </Section>
  );
}

function Npi({ initial }: { initial: Props["growth"]["npi"] }) {
  const [npi, setNpi] = useState(initial);
  const [number, setNumber] = useState("");
  const [state, setState] = useState("");
  const a = useAction();
  return (
    <Section id="npi" title="NPI" hint="We check your NPI against the public registry. It's self-attested and only adds a badge.">
      {npi && <p className={`text-sm ${npi.matched ? "text-ok" : "text-warn"}`} data-testid="npi-status">{npi.matched ? `${npi.name} · NPI ${npi.number} on file` : `Not matched: ${npi.reason}`}</p>}
      <form className="grid grid-cols-[1fr_5rem_auto] gap-2" onSubmit={(e) => { e.preventDefault(); a.run(async () => { const r = await api<Props["growth"]["npi"] & { badge: string | null }>("/growth/npi", { body: { npi: number, state: state || undefined } }); setNpi(r); return r?.matched ? "NPI added" : "Saved, but it didn't match"; }); }}>
        <label className="sr-only" htmlFor="npi-input">NPI</label>
        <input id="npi-input" className="input" inputMode="numeric" placeholder="10-digit NPI" value={number} onChange={(e) => setNumber(e.target.value)} required data-testid="npi-input" />
        <label className="sr-only" htmlFor="npi-state">State</label>
        <input id="npi-state" className="input uppercase" maxLength={2} placeholder="IL" value={state} onChange={(e) => setState(e.target.value)} data-testid="npi-state" />
        <button className="btn-primary" disabled={a.busy} data-testid="npi-save">{a.busy && <Spinner />} Check</button>
      </form>
      {a.note}
    </Section>
  );
}

function Receipt({ stats, sample = false }: { stats: Props["receipt"]; sample?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const a = useAction();
  return (
    <Section id="receipt" title="This week" hint="A card you can share. It never includes patient information.">
      <p className="text-sm" data-testid="receipt-summary">{stats.notesSigned} charts closed · {stats.hoursBack} hours back · {stats.closedSameDay} before leaving clinic</p>
      {sample && <p className="text-xs text-ink-3" data-testid="receipt-sample">These numbers include your sample clinic day.</p>}
      {url ? <a className="block break-all text-sm font-medium text-brand" href={new URL(url).pathname} data-testid="receipt-link">{url}</a> : <button className="btn-outline w-full" disabled={a.busy} onClick={() => a.run(async () => { const r = await api<{ url: string }>("/growth/receipt", { method: "POST" }); setUrl(r.url); return "Share link ready"; })} data-testid="receipt-create">{a.busy && <Spinner />} Make a share card</button>}
      {a.note}
    </Section>
  );
}

function Referral({ growth }: { growth: Props["growth"] }) {
  const [copied, setCopied] = useState(false);
  return (
    <Section id="referral" title="Invite colleagues" hint={`You both get a free month when they sign their first note. Up to ${growth.credits.cap} months.`}>
      <p className="break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs" data-testid="referral-url">{growth.referral.url}</p>
      <p className="text-sm" data-testid="credits">{growth.credits.months} free month{growth.credits.months === 1 ? "" : "s"} earned{growth.credits.capped ? " (at the cap)" : ""}</p>
      <div className="grid grid-cols-2 gap-2">
        <a className="btn-outline text-center" href={`sms:?&body=${encodeURIComponent(growth.referral.message)}`}>Text a colleague</a>
        <button className="btn-outline" onClick={async () => { await navigator.clipboard?.writeText(growth.referral.url).catch(() => undefined); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </Section>
  );
}

function Devices({ initial }: { initial: Props["devices"] }) {
  const [devices, setDevices] = useState(initial);
  const a = useAction();
  return (
    <Section id="devices" title="Connected devices" hint="Shortcuts and apps that can upload recordings to your account.">
      {!devices.length && <p className="text-sm text-ink-3">None yet.</p>}
      {devices.map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-sm" data-testid="device-row">
          <span className="flex-1"><span className="font-medium">{d.label}</span><span className="block text-xs text-ink-3">{d.lastUsedAt ? `Last used ${new Date(d.lastUsedAt).toLocaleDateString("en-US")}` : "Not used yet"} · expires {new Date(d.expiresAt).toLocaleDateString("en-US")}</span></span>
          <button className="text-sm text-rec" disabled={a.busy} onClick={() => a.run(async () => { await api(`/capture/token/${d.id}`, { method: "DELETE" }); setDevices((x) => x.filter((y) => y.id !== d.id)); return `${d.label} disconnected`; })} data-testid="device-revoke">Disconnect</button>
        </div>
      ))}
      <a className="btn-outline block text-center" href="/go/shortcut" data-testid="add-shortcut">Add the iPhone Shortcut</a>
      {a.note}
    </Section>
  );
}

export default function GoSettings(p: Props) {
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(p.user.phone);
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <main className="min-h-screen bg-paper pb-10" data-ready={ready ? "true" : undefined} data-testid="go-settings">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Logo />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold">Settings</h1>
            <p className="truncate text-xs text-ink-3">{p.user.name} · {p.user.email}</p>
          </div>
          <a className="text-sm font-medium text-brand" href="/go/stack">To review</a>
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <Phone initial={p.user.phone} onVerified={setPhone} />
        <Pin initial={p.pinSet} />
        <Nudge initial={p.user.prefs?.clinicNudgeHour ?? null} hasPhone={!!phone} />
        <Devices initial={p.devices} />
        <Npi initial={p.growth.npi} />
        <Receipt stats={p.receipt} sample={!!(p.user as { prefs?: { sampleDay?: boolean } }).prefs?.sampleDay} />
        <Referral growth={p.growth} />
      </div>
    </main>
  );
}
