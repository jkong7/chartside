import Link from "next/link";
import { notFound } from "next/navigation";
import SharedNote from "@/components/SharedNote";
import { requireUser } from "@/lib/server/auth";
import { memberView } from "@/lib/server/sharing";

export const dynamic = "force-dynamic";

export default async function SharedPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const user = await requireUser();
  const v = await memberView(user, shareId);
  if (!v) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <Link href="/today" className="text-sm text-ink-3 hover:text-ink">← Today</Link>
      <div className="mt-4">
        <SharedNote s={v} message={v.share.message} banner={`Shared with you by ${v.clinician} · ${v.share.access === "edit" ? "can edit" : "view only"}`} />
      </div>
      {v.share.access === "edit" && <Link href={`/encounters/${v.encounterId}`} className="btn-primary mt-4 inline-flex" data-testid="shared-open-edit">Open the visit to edit</Link>}
    </div>
  );
}
