"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { ConsentRecord } from "@/lib/types";
import { Alert, Mic, Shield } from "../icons";
import { Spinner } from "../ui";
import { CareGaps } from "./QualityPanel";
import type { Bundle } from "./types";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const ALL_PARTY = new Set(["CA", "CT", "DE", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA"]);

export function PatientBrief({ b }: { b: Bundle }) {
  const p = b.patient;
  if (!p) return <div className="card p-5 text-sm text-ink-3">No patient is attached to this visit yet. You can still record; attach the patient before signing.</div>;
  const last = p.chart.priorVisits?.[0];
  return (
    <div className="card divide-y divide-line" data-testid="brief">
      <div className="p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Pre-visit brief</h3>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="label">Problems</p>
            {p.chart.problems.length ? <ul className="space-y-1 text-sm">{p.chart.problems.map((x) => <li key={x.name}>{x.name} {x.icd10 && <span className="font-mono text-xs text-ink-3">{x.icd10}</span>}{x.source?.startsWith("outside") && <span className="pill ml-1 bg-info-50 text-[10px] text-info" title={x.source.slice(8)}>outside</span>}</li>)}</ul> : <p className="text-sm text-ink-3">None on file</p>}
          </div>
          <div>
            <p className="label">Medications</p>
            {p.chart.medications.length ? <ul className="space-y-1 text-sm">{p.chart.medications.map((m) => <li key={m.name}>{m.name} <span className="text-ink-3">{[m.dose, m.frequency].filter(Boolean).join(" ")}</span>{m.source?.startsWith("outside") && <span className="pill ml-1 bg-info-50 text-[10px] text-info" title={m.source.slice(8)}>outside</span>}</li>)}</ul> : <p className="text-sm text-ink-3">None on file</p>}
          </div>
          <div>
            <p className="label">Allergies</p>
            {p.chart.allergies.length ? <div className="flex flex-wrap gap-1.5">{p.chart.allergies.map((a) => <span key={a.substance} className="pill bg-rec-50 text-rec">{a.substance}{a.reaction ? ` · ${a.reaction}` : ""}</span>)}</div> : <p className="text-sm text-ink-3">No known drug allergies</p>}
          </div>
          <div>
            <p className="label">Recent results</p>
            {p.chart.labs?.length ? <ul className="space-y-1 text-sm">{p.chart.labs.map((l) => <li key={l.name}><span className={l.flag === "high" || l.flag === "low" ? "font-medium text-warn" : ""}>{l.name} {l.value}</span> <span className="text-xs text-ink-3">{l.date}</span></li>)}</ul> : <p className="text-sm text-ink-3">None in the last 120 days</p>}
          </div>
        </div>
      </div>
      {last && (
        <div className="p-5">
          <p className="label">Last visit · {last.date}</p>
          <p className="text-sm text-ink-2">{last.summary}</p>
          {last.plan.length > 0 && (
            <div className="mt-3 rounded-lg bg-warn-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-warn">Last visit plan: close the loop today</p>
              <ul className="mt-1 list-inside list-disc text-sm text-ink-2">{last.plan.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PreVisit({ b, onChange, onStart }: { b: Bundle; onChange: () => void; onStart: (mode: "mic" | "simulate" | "type") => void }) {
  const [state, setState] = useState(b.state);
  const [method, setMethod] = useState<ConsentRecord["method"]>("verbal");
  const [others, setOthers] = useState(false);
  const [allConfirmed, setAllConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const consent = b.consent;
  const allParty = ALL_PARTY.has(state);
  const granted = consent?.decision === "granted";

  async function record(decision: "granted" | "declined") {
    setBusy(true);
    setErr(null);
    try {
      await api(`/encounters/${b.encounter.id}/consent`, { body: { decision, method, state, othersPresent: others, allPartiesConfirmed: allConfirmed } });
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record consent");
    } finally {
      setBusy(false);
    }
  }

  async function settings(patch: Record<string, string>) {
    await api(`/encounters/${b.encounter.id}`, { method: "PATCH", body: patch });
    onChange();
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <PatientBrief b={b} />
        <CareGaps quality={b.quality} />
        <div className="card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Visit settings</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="tpl">Note template</label>
              <select id="tpl" className="input" value={b.encounter.templateId ?? b.template.id} onChange={(e) => settings({ templateId: e.target.value })}>
                {b.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="inlang">Conversation language</label>
              <select id="inlang" className="input" value={b.encounter.inputLang} onChange={(e) => settings({ inputLang: e.target.value })}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="zh">Mandarin</option>
                <option value="vi">Vietnamese</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="outlang">Patient summary language</label>
              <select id="outlang" className="input" value={b.encounter.outputLang} onChange={(e) => settings({ outputLang: e.target.value })}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="zh">Mandarin</option>
                <option value="vi">Vietnamese</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className={`card p-5 ${granted ? "border-ok/40" : ""}`} data-testid="consent-card">
          <div className="flex items-center gap-2">
            <Shield className={granted ? "text-ok" : "text-brand"} />
            <h3 className="font-semibold">Recording consent</h3>
          </div>
          {consent ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className={`pill ${granted ? "bg-ok-50 text-ok" : "bg-rec-50 text-rec"}`}>{granted ? "Consent recorded" : "Patient declined"}</p>
              <p className="text-ink-2">{consent.statement}</p>
              <p className="font-mono text-[11px] text-ink-4" title="SHA-256 of the consent record">sha256 {consent.digest.slice(0, 16)}…</p>
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <p className="rounded-lg bg-sunken px-3 py-2.5 text-ink-2">&ldquo;{b.consentScript.script}&rdquo;</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="state">Patient location</label>
                  <select id="state" className="input" value={state} onChange={(e) => setState(e.target.value)}>
                    {STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="method">Method</label>
                  <select id="method" className="input" value={method} onChange={(e) => setMethod(e.target.value as ConsentRecord["method"])}>
                    <option value="verbal">Verbal</option>
                    <option value="written">Written</option>
                    <option value="patient-device">Patient&apos;s device</option>
                  </select>
                </div>
              </div>
              {allParty && <p className="flex gap-2 rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn"><Alert size={14} className="mt-0.5 shrink-0" />All-party consent state: everyone in the room must agree to recording.</p>}
              <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" className="accent-brand" checked={others} onChange={(e) => setOthers(e.target.checked)} /> Others present (family, interpreter, trainee)</label>
              {others && allParty && <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" className="accent-brand" checked={allConfirmed} onChange={(e) => setAllConfirmed(e.target.checked)} data-testid="all-parties" /> All parties agreed</label>}
              {err && <p className="text-xs text-rec" role="alert">{err}</p>}
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={busy} onClick={() => record("granted")}>{busy && <Spinner />} Patient agreed</button>
                <button className="btn-outline" disabled={busy} onClick={() => record("declined")}>Declined</button>
              </div>
              <p className="text-[11px] text-ink-3">Chartside writes the consent record itself. The AI never generates consent language.</p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold">Start the visit</h3>
          <p className="mt-1 text-sm text-ink-3">{granted ? "Chartside will listen, transcribe, and track coverage live." : consent ? "Ambient capture is off because the patient declined. Type or dictate your note instead." : "Record consent to enable ambient capture."}</p>
          <div className="mt-4 space-y-2">
            <button className="btn-danger w-full py-2.5" disabled={!granted} onClick={() => onStart("mic")} data-testid="start-mic"><Mic /> Start listening</button>
            {b.encounter.setting === "telehealth" && <p className="text-xs text-ink-3" data-testid="telehealth-hint">Telehealth: when asked, share the video visit tab and turn on Share tab audio. Your microphone and the patient&apos;s side are recorded on separate channels, so speakers are never mixed up.</p>}
            <button className="btn-outline w-full" disabled={!granted} onClick={() => onStart("simulate")} data-testid="start-simulate">Play demo conversation</button>
            <button className="btn-ghost w-full" disabled={!consent} onClick={() => onStart("type")} data-testid="start-type">{granted ? "Type or paste the conversation" : "Document manually"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
