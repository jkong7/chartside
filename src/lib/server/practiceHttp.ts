import { cookies } from "next/headers";
import { currentUser } from "./auth";
import { fail } from "./http";
import { Forbidden, Invalid } from "./policy";
import { newDevice, PRACTICE_COOKIE, validDevice, type Actor } from "./practice";
import { clientIp, limited, tooMany } from "./ratelimit";

async function setDevice() {
  const device = newDevice();
  (await cookies()).set(PRACTICE_COOKIE, device, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: 365 * 86400 });
  return device;
}

export async function rotatePracticeDevice() {
  await setDevice();
}

export async function clearPracticeDevice() {
  const jar = await cookies();
  if (jar.get(PRACTICE_COOKIE)) jar.delete(PRACTICE_COOKIE);
}

export async function practiceActor(create = false): Promise<Actor> {
  const jar = await cookies();
  let device = validDevice(jar.get(PRACTICE_COOKIE)?.value);
  if (!device && create) device = await setDevice();
  const user = await currentUser().catch(() => null);
  return { device, userId: user && !user.guestUntil ? user.id : null };
}

type Ctx<P> = { params: Promise<P> };

export function practiceRoute<P = Record<string, never>>(bucket: string, perHour: number, handler: (req: Request, actor: Actor, params: P) => Promise<Response> | Response, opts: { create?: boolean } = {}) {
  return async (req: Request, ctx: Ctx<P>) => {
    if (limited(`${bucket}:${clientIp(req)}`, perHour, 3600_000)) return tooMany();
    try {
      return await handler(req, await practiceActor(opts.create), (await ctx.params) ?? ({} as P));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      const status = err instanceof Forbidden ? 403 : err instanceof Invalid ? 422 : /not found/i.test(message) ? 404 : 500;
      if (status === 500) console.error(err);
      return fail(message, status);
    }
  };
}

export function practiceRate(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
