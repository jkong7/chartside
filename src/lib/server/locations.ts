import { all, get, now, run, uid } from "../db";
import { assertCan, Invalid } from "./policy";
import { audit, users, type User } from "./repo";

export interface Location {
  id: string;
  name: string;
  address: string;
  pos: string;
  archived: boolean;
}

const toLoc = (r: { id: string; name: string; address: string; pos: string; archived: number }): Location => ({ id: r.id, name: r.name, address: r.address, pos: r.pos, archived: !!Number(r.archived) });

export const locations = {
  list: async (orgId: string, includeArchived = false) => (await all<{ id: string; name: string; address: string; pos: string; archived: number }>(`SELECT id, name, address, pos, archived FROM locations WHERE org_id = ? ${includeArchived ? "" : "AND archived = 0"} ORDER BY name`, orgId)).map(toLoc),
  get: async (orgId: string, id: string) => {
    const r = await get<{ id: string; name: string; address: string; pos: string; archived: number }>("SELECT id, name, address, pos, archived FROM locations WHERE org_id = ? AND id = ?", orgId, id);
    return r ? toLoc(r) : undefined;
  },
};

export async function saveLocation(u: User, input: { id?: string; name?: string; address?: string; pos?: string; archived?: boolean }) {
  assertCan(u, "org.manage");
  const name = (input.name ?? "").trim();
  if (!input.id && !name) throw new Invalid("Name the location");
  const pos = input.pos ?? "11";
  if (!/^\d{2}$/.test(pos)) throw new Invalid("Place of service is a two-digit code");
  if (input.id) {
    const cur = await locations.get(u.orgId, input.id);
    if (!cur) throw new Error("Location not found");
    await run("UPDATE locations SET name = ?, address = ?, pos = ?, archived = ? WHERE id = ?", (name || cur.name).slice(0, 80), (input.address ?? cur.address).slice(0, 200), pos, input.archived ?? cur.archived ? 1 : 0, input.id);
    await audit.log(u, null, "location.updated", { id: input.id });
    return (await locations.get(u.orgId, input.id))!;
  }
  if ((await locations.list(u.orgId)).some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new Invalid(`${name} already exists`);
  const id = uid("loc_");
  await run("INSERT INTO locations (id, org_id, name, address, pos, archived, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)", id, u.orgId, name.slice(0, 80), (input.address ?? "").slice(0, 200), pos, now());
  await audit.log(u, null, "location.created", { id, name });
  return (await locations.get(u.orgId, id))!;
}

export async function defaultLocationFor(u: User) {
  const list = await locations.list(u.orgId);
  if (!list.length) return null;
  return list.find((l) => l.id === u.prefs.locationId)?.id ?? list[0].id;
}

export async function setMyLocation(u: User, locationId: string) {
  if (!(await locations.get(u.orgId, locationId))) throw new Invalid("Unknown location");
  await users.update(u.id, { prefs: { locationId } });
}
