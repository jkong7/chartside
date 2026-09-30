import { all, get, now, run, tx, uid } from "../db";
import { deleteAudio } from "./audio";
import { markGuestLoop } from "./loops";
import { Forbidden } from "./policy";
import { actorFor, audit, orgs, users, type BaseUser, type User } from "./repo";

export const GUEST_EMAIL_DOMAIN = "guest.chartside.invalid";

export function guestHours() {
  const h = Number(process.env.CHARTSIDE_GUEST_HOURS ?? 2);
  return Number.isFinite(h) && h > 0 ? h : 2;
}

export function isGuest(u: Pick<BaseUser, "guestUntil"> | null | undefined) {
  return !!u?.guestUntil;
}

export function assertNotGuest(u: User, what: string) {
  if (isGuest(u)) throw new Forbidden(`Save your note with your email first, then you can ${what}.`);
}

export async function createGuest(opts: { phone?: string | null; loop?: "patient_visit" } = {}): Promise<User> {
  const id = uid("usr_");
  const expires = new Date(Date.now() + guestHours() * 3600000).toISOString();
  await run("INSERT INTO users (id, email, name, password_hash, specialty, prefs, created_at, phone, guest_expires_at) VALUES (?, ?, ?, '', 'Family Medicine', ?, ?, ?, ?)", id, `${id}@${GUEST_EMAIL_DOMAIN}`, "Guest clinician", JSON.stringify({ defaultTemplate: "soap", state: "IL", simpleNav: true }), now(), opts.phone ?? null, expires);
  const org = await orgs.create("Unsaved practice", id);
  const actor = (await actorFor(id, org.id))!;
  await audit.log(actor, null, "guest.created", { via: opts.loop ?? (opts.phone ? "phone" : "web"), expiresAt: expires });
  await markGuestLoop(id, opts.loop ?? (opts.phone ? "phone_guest" : "go_guest"));
  return actor;
}

export async function guestForPhone(e164: string): Promise<User> {
  const r = await get<{ id: string }>("SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NULL AND guest_expires_at IS NOT NULL AND guest_expires_at > ? ORDER BY created_at DESC LIMIT 1", e164, now());
  if (r) {
    const actor = await actorFor(r.id);
    if (actor) return actor;
  }
  return createGuest({ phone: e164 });
}

const ownedOrgs = async (userId: string) => (await all<{ org_id: string }>("SELECT org_id FROM memberships WHERE user_id = ? AND role = 'owner'", userId)).map((r) => r.org_id);

export async function convertGuest(guestId: string, email: string) {
  const name = nameFromEmail(email);
  await tx(async () => {
    await run("UPDATE users SET email = ?, name = ?, guest_expires_at = NULL WHERE id = ?", email.toLowerCase().trim(), name, guestId);
    for (const orgId of await ownedOrgs(guestId)) await run("UPDATE organizations SET name = ? WHERE id = ?", `${name}'s practice`, orgId);
  });
  const actor = await actorFor(guestId);
  await audit.log(actor ?? { id: guestId, orgId: null }, null, "guest.claimed", { into: "new-account" });
  return guestId;
}

export async function mergeGuest(guestId: string, targetUserId: string) {
  const target = await actorFor(targetUserId);
  if (!target) throw new Forbidden("Your access to Chartside has been disabled");
  const guest = await get<{ phone: string | null; phone_verified_at: string | null }>("SELECT phone, phone_verified_at FROM users WHERE id = ? AND guest_expires_at IS NOT NULL AND guest_expires_at > ?", guestId, now());
  if (!guest) return 0;
  const guestOrgs = await ownedOrgs(guestId);
  let moved = 0;
  await tx(async () => {
    const encs = await all<{ id: string }>("SELECT id FROM encounters WHERE user_id = ?", guestId);
    moved = encs.length;
    await run("UPDATE encounters SET user_id = ?, org_id = ? WHERE user_id = ?", target.id, target.orgId, guestId);
    await run("UPDATE patients SET user_id = ?, org_id = ? WHERE user_id = ?", target.id, target.orgId, guestId);
    for (const orgId of guestOrgs) await run("UPDATE audit SET org_id = ? WHERE org_id = ?", target.orgId, orgId);
    const targetPhone = await get<{ phone_verified_at: string | null }>("SELECT phone_verified_at FROM users WHERE id = ?", target.id);
    if (guest.phone && guest.phone_verified_at && !targetPhone?.phone_verified_at) {
      await run("UPDATE users SET phone = NULL, phone_verified_at = NULL WHERE id = ?", guestId);
      await run("UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?", guest.phone, guest.phone_verified_at, target.id);
    }
    for (const orgId of guestOrgs) await run("DELETE FROM organizations WHERE id = ?", orgId);
    await run("DELETE FROM users WHERE id = ?", guestId);
  });
  await audit.log(target, null, "guest.claimed", { into: "existing-account", encounters: moved });
  return moved;
}

export async function touchGuest(userId: string) {
  const until = new Date(Date.now() + guestHours() * 3600000).toISOString();
  await run("UPDATE users SET guest_expires_at = ? WHERE id = ? AND guest_expires_at IS NOT NULL AND guest_expires_at > ? AND guest_expires_at < ?", until, userId, now(), until);
}

export async function purgeGuests(at = now()) {
  const expired = await all<{ id: string }>(
    "SELECT u.id FROM users u WHERE u.guest_expires_at IS NOT NULL AND u.guest_expires_at < ? AND NOT EXISTS (SELECT 1 FROM encounters e JOIN audio_chunks c ON c.encounter_id = e.id WHERE e.user_id = u.id AND e.status IN ('recording', 'paused') AND c.created_at > ?)",
    at,
    new Date(Date.parse(at) - 30 * 60_000).toISOString(),
  );
  const { liveCallsFor } = await import("./telephony/live");
  const purged: string[] = [];
  for (const g of expired) {
    if (liveCallsFor(g.id).length) continue;
    const claimed = await run("UPDATE users SET guest_expires_at = ? WHERE id = ? AND guest_expires_at IS NOT NULL AND guest_expires_at < ?", "1970-01-01T00:00:00.000Z", g.id, at);
    if (!claimed.changes) continue;
    const encs = await all<{ id: string; org_id: string }>("SELECT id, org_id FROM encounters WHERE user_id = ?", g.id);
    for (const e of encs) await deleteAudio({ id: g.id, orgId: e.org_id } as User, e.id, "unclaimed guest visit expired");
    const guestOrgs = await ownedOrgs(g.id);
    await tx(async () => {
      await run("DELETE FROM encounters WHERE user_id = ?", g.id);
      await run("DELETE FROM patients WHERE user_id = ?", g.id);
      for (const orgId of guestOrgs) await run("DELETE FROM organizations WHERE id = ?", orgId);
      await run("DELETE FROM users WHERE id = ?", g.id);
    });
    await audit.log(null, null, "guest.purged", { guestId: g.id, encounters: encs.length });
    purged.push(g.id);
  }
  return purged.length;
}

export function nameFromEmail(email: string) {
  const local = email.split("@")[0].split("+")[0].replace(/[._+-]+/g, " ").replace(/\d+/g, " ").trim();
  const name = local.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return name || "Clinician";
}

export { users };
