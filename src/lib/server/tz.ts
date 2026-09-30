import { cookies } from "next/headers";
import { TZ_COOKIE, tzOf, validTz } from "../tz";
import { users, type User } from "./repo";

export async function browserTz() {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  const tz = raw ? decodeURIComponent(raw) : null;
  return validTz(tz) ? tz : null;
}

export async function viewerTz(u?: User | null) {
  return tzOf({ prefs: { tz: (await browserTz()) ?? u?.prefs.tz } });
}

export async function captureTz<T extends User>(u: T, tz?: string | null): Promise<T> {
  const next = validTz(tz) ? tz : await browserTz().catch(() => null);
  if (!next || u.prefs.tz === next) return u;
  await users.update(u.id, { prefs: { tz: next } });
  return { ...u, prefs: { ...u.prefs, tz: next } };
}
