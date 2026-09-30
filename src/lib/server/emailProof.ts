import { get, now, run } from "../db";
import { actorFor, audit } from "./repo";

export async function emailVerified(userId: string) {
  return !!(await get<{ at: string | null }>("SELECT email_verified_at AS at FROM users WHERE id = ?", userId))?.at;
}

export async function markEmailProven(userId: string, via: string) {
  const u = await get<{ password_hash: string; email_verified_at: string | null }>("SELECT password_hash, email_verified_at FROM users WHERE id = ?", userId);
  if (!u || u.email_verified_at) return false;
  const squatted = !!u.password_hash;
  if (squatted) {
    await run("UPDATE users SET password_hash = '' WHERE id = ?", userId);
    await run("DELETE FROM auth_sessions WHERE user_id = ?", userId);
  }
  await run("UPDATE users SET email_verified_at = ? WHERE id = ?", now(), userId);
  const actor = await actorFor(userId);
  await audit.log(actor ?? { id: userId, orgId: null }, null, "email.verified", { via, passwordCleared: squatted });
  return squatted;
}

export async function trustEmail(userId: string) {
  await run("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", now(), userId);
}
