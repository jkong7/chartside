import { cookies } from "next/headers";
import { currentUser, hashPassword, publicUser, startSession } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { actorFor, audit, invites, orgs, users } from "@/lib/server/repo";
import { seedDemo } from "@/lib/server/seed";
import { attributeReferral, REF_COOKIE } from "@/lib/server/growth";
import { recordSignup, touchFromCookies } from "@/lib/server/loops";
import { requestEmailSignIn, SsoRequired } from "@/lib/server/magic";
import { setupNewAccount } from "@/lib/server/signup";
import { browserTz } from "@/lib/server/tz";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  const b = await body<{ email?: string; password?: string; name?: string; specialty?: string; npi?: string; demo?: boolean; orgName?: string; invite?: string; next?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  const name = (b.name ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address");
  if (!name) return fail("Enter your name");
  const tz = await browserTz();
  if (!b.password && !b.invite) {
    if (limited(`magic:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
    const current = await currentUser();
    try {
      const sent = await requestEmailSignIn(email, { next: b.next || "/go?welcome=1", origin: new URL(req.url).origin, guestUserId: current?.guestUntil ? current.id : null, profile: { name, specialty: b.specialty, npi: b.npi, demo: b.demo === true, tz: tz ?? undefined } });
      return json({ codeSent: true, ...sent });
    } catch (err) {
      if (err instanceof SsoRequired) return json({ error: err.message, sso: true }, 403);
      return fail(err instanceof Error ? err.message : "Could not send a code", 422);
    }
  }
  if ((b.password ?? "").length < 8) return fail("Password must be at least 8 characters");
  const sso = await orgs.requiringSso(email.split("@")[1]);
  if (sso) return json({ error: `${sso.name} requires single sign-on. Continue with SSO.`, sso: true }, 403);
  const invite = b.invite ? await invites.get(b.invite) : undefined;
  if (b.invite && (!invite || invite.acceptedAt || new Date(invite.expiresAt) < new Date())) return fail("This invitation is no longer valid", 410);
  if (invite && invite.email !== email) return fail(`This invitation was sent to ${invite.email}`, 403);
  if (await users.byEmail(email)) return fail("An account with that email already exists", 409);
  const base = await users.create({ email, name, passwordHash: hashPassword(b.password!), specialty: b.specialty?.trim() || "Family Medicine" });
  let orgId: string;
  if (invite) {
    await orgs.addMember(invite.orgId, base.id, invite.role);
    await invites.accept(invite.token);
    orgId = invite.orgId;
  } else {
    orgId = (await orgs.create(b.orgName?.trim() || `${name}'s clinic`, base.id)).id;
  }
  if (!invite) await setupNewAccount(base.id, { specialty: b.specialty, npi: b.npi, tz: tz ?? undefined }, { seed: false });
  else if (tz) await users.update(base.id, { prefs: { tz } });
  const user = (await actorFor(base.id, orgId))!;
  await audit.log(user, null, invite ? "member.joined" : "user.registered", invite ? { role: invite.role, via: "invite" } : {});
  if (!invite && b.demo !== false) await seedDemo(user);
  if (!invite) await attributeReferral(user.id, (await cookies()).get(REF_COOKIE)?.value);
  if (!invite) await recordSignup(user.id, await touchFromCookies(await cookies()));
  await startSession(user.id, orgId);
  return json({ user: publicUser(user), next: invite ? "/today" : "/go?welcome=1" }, 201);
}
