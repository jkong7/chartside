import { createUser, listUsers, scimAuth, scimError } from "@/lib/server/scim";

const H = { "content-type": "application/scim+json" };

export async function GET(req: Request) {
  try {
    const o = await scimAuth(req);
    const u = new URL(req.url);
    return Response.json(await listUsers(o.orgId, u.origin, u.searchParams.get("filter"), Math.max(1, Number(u.searchParams.get("startIndex") ?? 1)), Math.min(200, Number(u.searchParams.get("count") ?? 100))), { headers: H });
  } catch (err) {
    return scimError(err);
  }
}

export async function POST(req: Request) {
  try {
    const o = await scimAuth(req);
    return Response.json(await createUser(o, new URL(req.url).origin, await req.json()), { status: 201, headers: H });
  } catch (err) {
    return scimError(err);
  }
}
