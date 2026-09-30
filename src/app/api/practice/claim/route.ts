import { currentUser } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { claimPractice, isStudentEmail } from "@/lib/server/practice";
import { practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute("practice-claim", 60, async (_req, actor) => {
  const user = await currentUser();
  if (!user || user.guestUntil) return fail("Sign in with your email first", 401);
  const saved = await claimPractice(actor, user.id);
  return json({ saved, student: isStudentEmail(user.email), name: user.name });
});
