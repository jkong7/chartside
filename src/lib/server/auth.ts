import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { HOLDER_EMAIL_DOMAIN } from "./guest";
import { can, type Permission } from "./policy";
import { sessions, users, type Role, type User } from "./repo";

export const SESSION_COOKIE = "cs_session";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await sessions.user(token)) ?? null;
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function startSession(userId: string, orgId: string | null = null, days = 14) {
  if ((await users.byId(userId))?.email.endsWith(`@${HOLDER_EMAIL_DOMAIN}`)) throw new Error("This account can't sign in");
  const token = await sessions.create(userId, orgId, days, (await headers()).get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: days * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sessions.remove(token);
  jar.delete(SESSION_COOKIE);
}

export function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, specialty: u.specialty, prefs: u.prefs, orgId: u.orgId, orgName: u.orgName, role: u.role, guestUntil: u.guestUntil ?? null, phone: u.phone ? u.phone.replace(/\d(?=\d{4})/g, "•") : null };
}

export { users };

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePermission(p: Permission): Promise<User> {
  const u = await requireUser();
  if (!can(u, p)) redirect("/today");
  return u;
}

export async function requireRoles(roles: Role[]): Promise<User> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/today");
  return u;
}
