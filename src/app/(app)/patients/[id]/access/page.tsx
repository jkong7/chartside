import Link from "next/link";
import { notFound } from "next/navigation";
import { accessReport } from "@/lib/server/access";
import { requireRoles } from "@/lib/server/auth";
import { audit } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function AccessReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoles(["owner", "admin"]);
  const r = await accessReport(user, id).catch(() => null);
  if (!r) notFound();
  await audit.log(user, null, "access_report.run", { patientId: id, format: "page" });
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <Link href={`/patients/${id}`} className="text-sm text-ink-3 hover:text-ink">← {r.patient.name}</Link>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Access report</h1>
          <p className="mt-1 text-sm text-ink-2">Everyone who viewed, exported, shared, or signed {r.patient.name}&apos;s visits in the last {r.days} days, including disclosures outside the organization, for HIPAA access and disclosure requests.</p>
        </div>
        <a className="btn-outline" href={`/api/patients/${id}/access?format=csv`} data-testid="access-csv">Download CSV</a>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="access-kpis">
        <div className="card p-4"><p className="label">Events</p><p className="font-serif text-3xl">{r.events.length}</p></div>
        <div className="card p-4"><p className="label">Outside disclosures</p><p className="font-serif text-3xl">{r.disclosures.length}</p></div>
        <div className="card p-4"><p className="label">Break-the-glass opens</p><p className={`font-serif text-3xl ${r.breakGlass ? "text-warn" : ""}`}>{r.breakGlass}</p></div>
      </div>
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" data-testid="access-events">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-4"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Visit</th></tr></thead>
          <tbody className="divide-y divide-line">
            {r.events.map((e, i) => (
              <tr key={i} className={e.disclosure ? "bg-warn-50/40" : ""} data-testid="access-row">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-3">{new Date(e.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-3 py-2">{e.who}</td>
                <td className="px-3 py-2">{e.action}{e.detail && <p className="text-xs text-ink-3">{e.detail}</p>}</td>
                <td className="px-3 py-2"><Link className="text-xs text-brand" href={`/encounters/${e.encounterId}`}>{new Date(e.visitDate).toLocaleDateString("en-US")}</Link></td>
              </tr>
            ))}
            {!r.events.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-3">No access recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
