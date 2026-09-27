"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { CoverageInfo } from "@/lib/types";
import { Spinner } from "./ui";

const PAYERS: CoverageInfo["payer"][] = ["Medicare", "Medicare Advantage", "Medicaid", "Commercial", "Self-pay"];
const SEGMENTS: [string, string][] = [["", "Default for age"], ["COMMUNITY_NA", "Community, non-dual, aged"], ["COMMUNITY_PBA", "Community, partial dual, aged"], ["COMMUNITY_FBA", "Community, full dual, aged"], ["COMMUNITY_ND", "Community, non-dual, disabled"], ["COMMUNITY_PBD", "Community, partial dual, disabled"], ["COMMUNITY_FBD", "Community, full dual, disabled"], ["INSTITUTIONAL", "Long-term institutional"]];

export default function CoverageCard({ patientId, initial, canEdit }: { patientId: string; initial?: CoverageInfo; canEdit: boolean }) {
  const [c, setC] = useState<CoverageInfo>(initial ?? { payer: "Commercial" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="card p-4" data-testid="coverage-card">
      <p className="label">Coverage</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select className="input text-sm" value={c.payer} disabled={!canEdit} onChange={(e) => { setC({ ...c, payer: e.target.value as CoverageInfo["payer"] }); setSaved(false); }} aria-label="Payer">{PAYERS.map((p) => <option key={p}>{p}</option>)}</select>
        <input className="input text-sm" placeholder="Plan" value={c.plan ?? ""} disabled={!canEdit} onChange={(e) => { setC({ ...c, plan: e.target.value }); setSaved(false); }} aria-label="Plan" />
        <input className="input text-sm" placeholder="Member ID" value={c.memberId ?? ""} disabled={!canEdit} onChange={(e) => { setC({ ...c, memberId: e.target.value }); setSaved(false); }} aria-label="Member ID" />
        {(c.payer === "Medicare" || c.payer === "Medicare Advantage") && <select className="input text-sm" value={c.hccSegment ?? ""} disabled={!canEdit} onChange={(e) => { setC({ ...c, hccSegment: e.target.value || undefined }); setSaved(false); }} aria-label="HCC segment">{SEGMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
      </div>
      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-outline px-3 py-1 text-xs" disabled={busy} onClick={async () => { setBusy(true); await api(`/patients/${patientId}`, { method: "PATCH", body: { chart: { coverage: c } } }); setBusy(false); setSaved(true); }} data-testid="save-coverage">{busy && <Spinner />} Save coverage</button>
          {saved && <span className="text-xs text-ok">Saved</span>}
        </div>
      )}
    </div>
  );
}
