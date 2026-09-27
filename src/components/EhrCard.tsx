"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Alert, Check, Link as LinkIcon, X } from "./icons";

export interface EhrStatus {
  configured: boolean;
  clientId: string | null;
  defaultIss: string;
  label: string;
  connections: { id: string; iss: string; system: string; patient: string | null; encounter: string | null; scope: string; expiresAt: string; expired: boolean; hasRefresh: boolean; createdAt: string }[];
}

export default function EhrCard({ initial, error, connected, autoFile }: { initial: EhrStatus; error?: string; connected?: boolean; autoFile: boolean }) {
  const [s, setS] = useState(initial);
  const [auto, setAuto] = useState(autoFile);
  return (
    <div className="card p-5" data-testid="ehr-settings">
      <div className="flex items-center gap-2">
        <LinkIcon size={16} className="text-brand" />
        <p className="text-sm font-semibold">EHR integration (SMART on FHIR)</p>
        <span className={`pill ml-auto ${s.configured ? "bg-ok-50 text-ok" : "bg-sunken text-ink-3"}`}>{s.configured ? `Client ${s.clientId}` : "Not configured"}</span>
      </div>
      {error && <p className="mt-3 flex gap-2 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert" data-testid="ehr-error"><Alert size={15} className="mt-0.5 shrink-0" />{error}</p>}
      {connected && <p className="mt-3 flex gap-2 rounded-lg bg-ok-50 px-3 py-2 text-sm text-ok" role="status"><Check size={15} className="mt-0.5" /> Connected to the EHR.</p>}
      <p className="mt-2 text-sm text-ink-2">
        Chartside launches from inside {s.label} with the patient and encounter in context. It imports problems, medications, allergies, labs, and vitals into the pre-visit brief, and files the signed note back as a clinical note (FHIR DocumentReference).
      </p>
      {s.configured ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a className="btn-primary" href={`/smart/connect?iss=${encodeURIComponent(s.defaultIss)}`} data-testid="ehr-connect">Connect to {s.label}</a>
          <span className="font-mono text-[11px] text-ink-3">{s.defaultIss}</span>
        </div>
      ) : (
        <details className="mt-3 text-sm text-ink-2" open>
          <summary className="cursor-pointer font-medium text-brand">How to connect the Epic sandbox</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Create a free account at fhir.epic.com, then choose <span className="font-medium">Build Apps → Create</span>.</li>
            <li>Audience: <span className="font-medium">Clinicians or Administrative Users</span>. SMART on FHIR version: <span className="font-medium">R4</span>. Public client (PKCE).</li>
            <li>Redirect URI: <span className="kbd">{typeof window !== "undefined" ? window.location.origin : "http://localhost:3100"}/smart/callback</span>. Launch URI: <span className="kbd">…/smart/launch</span>.</li>
            <li>APIs: Patient.Read, Condition.Search (Problems), MedicationRequest.Search, AllergyIntolerance.Search, Observation.Search (Labs, Vitals), Encounter.Read, DocumentReference.Create (Clinical Notes).</li>
            <li>Set <span className="kbd">SMART_CLIENT_ID</span> to the non-production client ID and restart Chartside. Then launch from Epic&apos;s sandbox launcher, or use Connect here.</li>
          </ol>
        </details>
      )}
      {s.connections.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {s.connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm" data-testid="ehr-connection">
              <span className="font-medium">{c.system}</span>
              <span className="text-ink-3">{c.patient ? `Patient/${c.patient}` : "no patient in context"}{c.encounter ? ` · Encounter/${c.encounter}` : ""}</span>
              <span className={`pill ${c.expired ? (c.hasRefresh ? "bg-sunken text-ink-3" : "bg-warn-50 text-warn") : "bg-ok-50 text-ok"}`}>{c.expired ? (c.hasRefresh ? "refreshes on use" : "expired") : "active"}</span>
              <button className="ml-auto text-ink-4 hover:text-rec" aria-label="Disconnect" onClick={async () => { await api(`/ehr/connections/${c.id}`, { method: "DELETE" }); setS((x) => ({ ...x, connections: x.connections.filter((y) => y.id !== c.id) })); }}><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="accent-brand" checked={auto} onChange={async (e) => { setAuto(e.target.checked); await api("/auth/me", { method: "PATCH", body: { prefs: { autoFileEhr: e.target.checked } } }); }} />
        File signed notes to the EHR automatically when a visit was launched from it
      </label>
    </div>
  );
}
