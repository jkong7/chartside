import { hashPassword, publicUser, startSession } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { audit, users } from "@/lib/server/repo";
import { seedDemo } from "@/lib/server/seed";

export async function POST(req: Request) {
  const b = await body<{ email?: string; password?: string; name?: string; specialty?: string; demo?: boolean }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  const name = (b.name ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address");
  if (!name) return fail("Enter your name");
  if ((b.password ?? "").length < 8) return fail("Password must be at least 8 characters");
  if (users.byEmail(email)) return fail("An account with that email already exists", 409);
  const user = users.create({ email, name, passwordHash: hashPassword(b.password!), specialty: b.specialty?.trim() || "Family Medicine" });
  audit.log(user.id, null, "user.registered", {});
  if (b.demo !== false) await seedDemo(user);
  await startSession(user.id);
  return json({ user: publicUser(user) }, 201);
}
