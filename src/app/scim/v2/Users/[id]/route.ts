import { deleteUser, getUser, patchUser, replaceUser, scimAuth, scimError } from "@/lib/server/scim";

const H = { "content-type": "application/scim+json" };
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const o = await scimAuth(req);
    return Response.json(await getUser(o.orgId, new URL(req.url).origin, (await ctx.params).id), { headers: H });
  } catch (err) {
    return scimError(err);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const o = await scimAuth(req);
    return Response.json(await replaceUser(o.orgId, new URL(req.url).origin, (await ctx.params).id, await req.json()), { headers: H });
  } catch (err) {
    return scimError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const o = await scimAuth(req);
    return Response.json(await patchUser(o.orgId, new URL(req.url).origin, (await ctx.params).id, await req.json()), { headers: H });
  } catch (err) {
    return scimError(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const o = await scimAuth(req);
    await deleteUser(o.orgId, (await ctx.params).id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return scimError(err);
  }
}
