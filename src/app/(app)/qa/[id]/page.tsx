import QaReview from "@/components/QaReview";
import { requireRoles } from "@/lib/server/auth";
import { reviewDetail, RUBRIC } from "@/lib/server/qa";

export const dynamic = "force-dynamic";

export default async function QaReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoles(["owner", "admin", "viewer", "clinician"]);
  return <QaReview initial={await reviewDetail(user, (await params).id)} rubric={[...RUBRIC]} canReview={["owner", "admin", "viewer"].includes(user.role)} />;
}
