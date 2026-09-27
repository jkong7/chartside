import { publicUser, startSession, verifyPassword } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { audit, toUser, users } from "@/lib/server/repo";

export async function POST(req: Request) {
  const b = await body<{ email?: string; password?: string }>(req);
  const row = users.byEmail((b.email ?? "").trim());
  if (!row || !verifyPassword(b.password ?? "", row.password_hash)) return fail("Incorrect email or password", 401);
  await startSession(row.id);
  audit.log(row.id, null, "user.login", {});
  return json({ user: publicUser(toUser(row)) });
}
