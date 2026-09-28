import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { Forbidden, Invalid } from "./policy";
import type { User } from "./repo";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

type Ctx<P> = { params: Promise<P> };

export function authed<P = Record<string, never>>(handler: (req: Request, user: User, params: P) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx<P>) => {
    const user = await currentUser();
    if (!user) return fail("Not signed in", 401);
    try {
      return await handler(req, user, (await ctx.params) ?? ({} as P));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      if (err instanceof Error && err.name === "BreakGlass") return json({ error: err.message, breakGlass: true }, 423);
      const status = err instanceof Forbidden ? 403 : err instanceof Invalid || (err instanceof Error && err.name === "OidcError") ? 422 : /not found/i.test(message) ? 404 : /locked|read-only/i.test(message) ? 409 : 500;
      if (status === 500) console.error(err);
      return fail(message, status);
    }
  };
}
