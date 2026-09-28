import { notFound } from "next/navigation";
import AdmissionView from "@/components/AdmissionView";
import { requireRoles } from "@/lib/server/auth";
import { admissionDetail } from "@/lib/server/inpatient";

export const dynamic = "force-dynamic";

export default async function AdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoles(["owner", "admin", "clinician", "scribe", "viewer"]);
  const d = await admissionDetail(user, (await params).id);
  if (!d) notFound();
  return <AdmissionView initial={d} canDocument={["owner", "admin", "clinician", "scribe"].includes(user.role)} />;
}
