import { endSession } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { clearPracticeDevice } from "@/lib/server/practiceHttp";

export async function POST() {
  await endSession();
  await clearPracticeDevice();
  return json({ ok: true });
}
