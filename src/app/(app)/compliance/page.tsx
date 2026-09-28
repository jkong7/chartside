import Link from "next/link";
import { requireRoles } from "@/lib/server/auth";
import { complianceReport } from "@/lib/server/compliance";

export const dynamic = "force-dynamic";

const TONE = { pass: "bg-ok-50 text-ok", warn: "bg-warn-50 text-warn", fail: "bg-rec-50 text-rec" } as const;
const LABEL = { pass: "OK", warn: "Review", fail: "Action needed" } as const;

export default async function CompliancePage() {
  const user = await requireRoles(["owner", "admin"]);
  const r = await complianceReport(user);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Security & compliance</h1>
          <p className="mt-1 text-sm text-ink-2">How your organization's settings and the last {r.days} days of activity line up with HIPAA safeguards and recording-consent law. Share this page with your privacy officer.</p>
        </div>
        <a className="btn-outline" href="/api/admin/audit-export" data-testid="audit-export">Export audit log (30 days)</a>
        <a className="btn-outline" href="/api/admin/export" data-testid="data-export">Export all data (FHIR NDJSON)</a>
      </div>
      <div className="card mt-5 flex items-center gap-4 p-4" data-testid="compliance-score"><p className="font-serif text-4xl">{r.score}%</p><p className="text-sm text-ink-2">of checks pass</p></div>
      <ul className="card mt-4 divide-y divide-line" data-testid="compliance-checks">
        {r.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-3" data-testid="compliance-check" data-status={c.status}>
            <span className={`pill mt-0.5 w-28 justify-center text-[11px] ${TONE[c.status]}`}>{LABEL[c.status]}</span>
            <div className="min-w-0 flex-1"><p className="font-medium">{c.label}</p><p className="text-sm text-ink-3">{c.detail}</p></div>
            {c.href && c.status !== "pass" && <Link href={c.href} className="text-xs text-brand">Fix</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
