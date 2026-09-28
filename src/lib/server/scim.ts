import { all, get, now, run } from "../db";
import { ROLES, audit, orgs, sessions, users, type Role } from "./repo";
import { scimOrg } from "./security";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const EXT = "urn:chartside:params:scim:schemas:extension:1.0:User";

export class ScimError extends Error {
  constructor(public status: number, message: string, public scimType?: string) {
    super(message);
  }
}

export function scimError(err: unknown) {
  const status = err instanceof ScimError ? err.status : 500;
  if (status === 500) console.error(err);
  return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), scimType: err instanceof ScimError ? err.scimType : undefined, detail: err instanceof Error ? err.message : "Error" }, { status, headers: { "content-type": "application/scim+json" } });
}

export async function scimAuth(req: Request) {
  const o = await scimOrg(req);
  if (!o) throw new ScimError(401, "Invalid SCIM bearer token");
  return o;
}

interface Row {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  created_at: string;
}

function toScim(r: Row, base: string) {
  const [given, ...rest] = r.name.split(" ");
  return {
    schemas: [USER_SCHEMA, EXT],
    id: r.id,
    userName: r.email,
    name: { formatted: r.name, givenName: given, familyName: rest.join(" ") },
    displayName: r.name,
    emails: [{ value: r.email, primary: true, type: "work" }],
    active: r.status === "active",
    [EXT]: { role: r.role },
    meta: { resourceType: "User", created: r.created_at, location: `${base}/scim/v2/Users/${r.id}` },
  };
}

async function row(orgId: string, id: string) {
  return get<Row>("SELECT u.id, u.email, u.name, m.role, m.status, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.id = ?", orgId, id);
}

export async function listUsers(orgId: string, base: string, filter: string | null, startIndex = 1, count = 100) {
  let rows = await all<Row>("SELECT u.id, u.email, u.name, m.role, m.status, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at", orgId);
  if (filter) {
    const m = /^\s*(userName|emails(?:\.value)?|externalId)\s+eq\s+"([^"]*)"\s*$/i.exec(filter);
    if (!m) throw new ScimError(400, "Only 'userName eq \"…\"' filters are supported", "invalidFilter");
    rows = rows.filter((r) => r.email.toLowerCase() === m[2].toLowerCase());
  }
  const page = rows.slice(startIndex - 1, startIndex - 1 + count);
  return { schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: rows.length, startIndex, itemsPerPage: page.length, Resources: page.map((r) => toScim(r, base)) };
}

export async function getUser(orgId: string, base: string, id: string) {
  const r = await row(orgId, id);
  if (!r) throw new ScimError(404, "User not found");
  return toScim(r, base);
}

function roleFrom(body: Record<string, unknown>, fallback: string): Role {
  const ext = body[EXT] as { role?: string } | undefined;
  const r = (ext?.role ?? fallback) as Role;
  if (!ROLES.includes(r) || r === "owner") throw new ScimError(400, `Unknown or disallowed role ${r}`, "invalidValue");
  return r;
}

export async function createUser(o: { orgId: string; defaultRole: string }, base: string, body: Record<string, unknown>) {
  const email = String(body.userName ?? (body.emails as { value: string }[] | undefined)?.[0]?.value ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new ScimError(400, "userName must be an email address", "invalidValue");
  const nm = body.name as { formatted?: string; givenName?: string; familyName?: string } | undefined;
  const name = String(body.displayName ?? nm?.formatted ?? [nm?.givenName, nm?.familyName].filter(Boolean).join(" ") ?? email).trim() || email;
  const role = roleFrom(body, o.defaultRole);
  let u = await users.byEmail(email);
  if (u && (await orgs.membership(o.orgId, u.id))) throw new ScimError(409, "User already exists", "uniqueness");
  const id = u?.id ?? (await users.create({ email, name, passwordHash: "", specialty: "" })).id;
  await orgs.addMember(o.orgId, id, role);
  if (body.active === false) await orgs.setStatus(o.orgId, id, "disabled");
  await audit.log({ id: null, orgId: o.orgId }, null, "scim.user_created", { userId: id, role });
  return getUser(o.orgId, base, id);
}

async function applyChanges(orgId: string, id: string, changes: { active?: boolean; name?: string; role?: Role }) {
  const cur = await row(orgId, id);
  if (!cur) throw new ScimError(404, "User not found");
  if (cur.role === "owner" && (changes.active === false || (changes.role && changes.role !== "owner"))) throw new ScimError(400, "Owners can't be changed through SCIM", "mutability");
  if (changes.name) await run("UPDATE users SET name = ? WHERE id = ?", changes.name.slice(0, 120), id);
  if (changes.role && changes.role !== cur.role) await orgs.setRole(orgId, id, changes.role);
  if (changes.active !== undefined && (changes.active ? "active" : "disabled") !== cur.status) {
    await orgs.setStatus(orgId, id, changes.active ? "active" : "disabled");
    if (!changes.active) await sessions.removeForUserInOrg(id, orgId);
  }
  await audit.log({ id: null, orgId }, null, "scim.user_updated", { userId: id, ...changes });
}

export async function replaceUser(orgId: string, base: string, id: string, body: Record<string, unknown>) {
  const nm = body.name as { formatted?: string; givenName?: string; familyName?: string } | undefined;
  const cur = await row(orgId, id);
  if (!cur) throw new ScimError(404, "User not found");
  await applyChanges(orgId, id, { active: body.active === undefined ? undefined : !!body.active, name: (body.displayName as string) ?? nm?.formatted ?? ([nm?.givenName, nm?.familyName].filter(Boolean).join(" ") || undefined), role: (body[EXT] as { role?: string } | undefined)?.role ? roleFrom(body, cur.role) : undefined });
  return getUser(orgId, base, id);
}

export async function patchUser(orgId: string, base: string, id: string, body: { Operations?: { op: string; path?: string; value?: unknown }[] }) {
  const changes: { active?: boolean; name?: string; role?: Role } = {};
  for (const op of body.Operations ?? []) {
    if (!/^(replace|add)$/i.test(op.op)) throw new ScimError(400, `Unsupported op ${op.op}`, "invalidSyntax");
    const apply = (path: string, value: unknown) => {
      if (/^active$/i.test(path)) changes.active = value === true || value === "True" || value === "true";
      else if (/^(displayName|name\.formatted)$/i.test(path)) changes.name = String(value);
      else if (path === `${EXT}:role` || /^role$/i.test(path)) changes.role = roleFrom({ [EXT]: { role: value } }, "clinician");
    };
    if (op.path) apply(op.path, op.value);
    else if (op.value && typeof op.value === "object") for (const [k, v] of Object.entries(op.value as Record<string, unknown>)) {
      if (k === EXT && v && typeof v === "object") apply(`${EXT}:role`, (v as { role?: string }).role);
      else apply(k, v);
    }
  }
  await applyChanges(orgId, id, changes);
  return getUser(orgId, base, id);
}

export async function deleteUser(orgId: string, id: string) {
  const cur = await row(orgId, id);
  if (!cur) throw new ScimError(404, "User not found");
  if (cur.role === "owner") throw new ScimError(400, "Owners can't be removed through SCIM", "mutability");
  await sessions.removeForUserInOrg(id, orgId);
  await orgs.removeMember(orgId, id);
  await audit.log({ id: null, orgId }, null, "scim.user_deleted", { userId: id, at: now() });
}
