import { requireRoles } from "@/lib/server/auth";
import { census } from "@/lib/server/inpatient";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const SEV: Record<string, string> = { stable: "Stable", watcher: "Watcher", unstable: "Unstable" };

export default async function HandoffPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "nurse", "scribe", "viewer"]);
  const list = await census(user);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 print:max-w-none print:p-0">
      <div className="flex items-center gap-3 print:hidden">
        <h1 className="flex-1 font-serif text-3xl">I-PASS handoff</h1>
        <PrintButton />
      </div>
      <p className="mt-1 text-sm text-ink-3 print:text-xs">{user.orgName} · {new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {list.length} patient{list.length === 1 ? "" : "s"}</p>
      <table className="mt-4 w-full border-collapse text-sm" data-testid="handoff-table">
        <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3">
          <tr><th className="border-b border-line py-2 pr-3">Patient</th><th className="border-b border-line py-2 pr-3">Illness severity</th><th className="border-b border-line py-2 pr-3">Patient summary</th><th className="border-b border-line py-2 pr-3">Action list</th><th className="border-b border-line py-2">Situation awareness</th></tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id} className="align-top" data-testid="handoff-row">
              <td className="border-b border-line py-2 pr-3"><p className="font-medium">{a.room ? `${a.room} · ` : ""}{a.patientName}</p><p className="text-xs text-ink-3">MRN {a.mrn} · Day {a.day}</p></td>
              <td className="border-b border-line py-2 pr-3">{SEV[a.handoff.severity]}</td>
              <td className="border-b border-line py-2 pr-3">{a.handoff.summary}</td>
              <td className="border-b border-line py-2 pr-3"><ul className="list-disc pl-4">{a.handoff.actions.map((x) => <li key={x}>☐ {x}</li>)}</ul></td>
              <td className="border-b border-line py-2">{a.handoff.awareness || "—"}<p className="mt-2 text-xs text-ink-4">Synthesis by receiver: ________</p></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
