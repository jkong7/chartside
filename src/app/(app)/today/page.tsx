import { isCore } from "@/lib/edition";
import TodayList, { type TodayRow } from "@/components/TodayList";
import { requireUser } from "@/lib/server/auth";
import { can } from "@/lib/server/policy";
import Link from "next/link";
import { dayBounds } from "@/lib/tz";
import { viewerTz } from "@/lib/server/tz";
import { encounters, orgs, patients, SEES_ORG } from "@/lib/server/repo";
import { sharedWithMe } from "@/lib/server/sharing";
import { surveyDue } from "@/lib/server/survey";
import SurveyPrompt from "@/components/SurveyPrompt";
import Onboarding from "@/components/Onboarding";
import { onboarding } from "@/lib/server/onboarding";
import { planFor } from "@/lib/server/plan";
import { locations } from "@/lib/server/locations";
import LocationFilter from "@/components/LocationFilter";

export const dynamic = "force-dynamic";

export default async function Today({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const locs = await locations.list(user.orgId);
  const loc = sp.loc && locs.some((l) => l.id === sp.loc) ? sp.loc : null;
  const day = dayBounds(new Date(), await viewerTz(user));
  const todays = await encounters.list(user, { from: day.from, to: day.to, outpatient: true, locationId: loc ?? undefined });
  const byId = new Map((await Promise.all([...new Set(todays.map((e) => e.patientId).filter((x): x is string => !!x))].map((id) => patients.get(user, id)))).filter((p) => !!p).map((p) => [p!.id, p!]));
  const rows: TodayRow[] = todays.map((e) => {
    const p = e.patientId ? byId.get(e.patientId) : undefined;
    return { ...e, patient: p ? { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, openLoops: p.chart.priorVisits?.[0]?.plan ?? [] } : null };
  });
  const orgWide = SEES_ORG.has(user.role);
  const clinicians = orgWide ? (await orgs.members(user.orgId)).filter((m) => m.status === "active" && ["owner", "admin", "clinician"].includes(m.role)).map((m) => ({ id: m.userId, name: m.name })) : [];
  const shared = await sharedWithMe(user);
  const survey = await surveyDue(user);
  const steps = await onboarding(user);
  const core = isCore();
  const plan = !core && ["owner", "admin"].includes(user.role) ? await planFor(user.orgId) : null;
  return (
    <>
    {plan?.tier === "trial" && plan.daysLeft !== null && plan.daysLeft <= 3 && (
      <div className="mx-auto max-w-5xl px-4 pt-6 md:px-8"><p className="rounded-lg bg-warn-50 px-4 py-2.5 text-sm text-warn" data-testid="trial-banner">Your free trial ends in {plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"}. <Link href="/admin" className="font-medium underline">Choose a plan</Link> to keep your notes flowing.</p></div>
    )}
    {steps && <Onboarding items={steps} />}
    {!core && locs.length > 1 && <LocationFilter locations={locs.map((l) => ({ id: l.id, name: l.name }))} selected={loc} mine={user.prefs.locationId ?? null} />}
    <TodayList
      rows={rows}
      me={user.id}
      orgWide={orgWide}
      clinicians={clinicians}
      canCreate={can(user, "clinical.create")}
      canCapture={can(user, "clinical.capture")}
    />
    {survey && <SurveyPrompt />}
    {!core && shared.length > 0 && (
      <section className="mx-auto max-w-5xl px-4 pb-10 md:px-8" data-testid="shared-with-me">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Shared with you</h2>
        <ul className="card mt-2 divide-y divide-line">
          {shared.map((s) => (
            <li key={s.id}>
              <Link href={`/shared/${s.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-sunken" data-testid="shared-item">
                <span className="min-w-0 flex-1 truncate"><span className="font-medium">{s.patientName ?? "Visit"}</span> · {s.reason || "Visit"} · from {s.ownerName}</span>
                <span className="pill bg-sunken text-[11px] text-ink-3">{s.access === "edit" ? "Can edit" : "View only"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )}
    </>
  );
}
