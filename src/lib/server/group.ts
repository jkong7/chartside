import { all, get, now, run, uid } from "../db";
import { guessAssignments, memberTranscript, participationCounts, type GroupMember } from "../engine/group";
import { Forbidden, Invalid } from "./policy";
import { recordConsent, processEncounter } from "./pipeline";
import { audit, consents, encounters, j, patients, utterances, type User } from "./repo";

interface Row {
  id: string;
  encounter_id: string;
  facilitator_id: string;
  title: string;
  members: string;
  assignments: string;
  member_encounters: string;
  created_at: string;
}

export interface GroupSession {
  id: string;
  encounterId: string;
  facilitatorId: string;
  title: string;
  members: GroupMember[];
  assignments: Record<string, string | null>;
  memberEncounters: Record<string, string>;
  createdAt: string;
}

const toGroup = (r: Row): GroupSession => ({ id: r.id, encounterId: r.encounter_id, facilitatorId: r.facilitator_id, title: r.title, members: j(r.members, []), assignments: j(r.assignments, {}), memberEncounters: j(r.member_encounters, {}), createdAt: r.created_at });

export const groups = {
  list: async (u: User) => (await all<Row>("SELECT * FROM group_sessions WHERE org_id = ? ORDER BY created_at DESC", u.orgId)).map(toGroup),
  get: async (u: User, id: string) => {
    const r = await get<Row>("SELECT * FROM group_sessions WHERE org_id = ? AND id = ?", u.orgId, id);
    return r ? toGroup(r) : undefined;
  },
  forMember: async (u: User, encId: string) => {
    const r = await get<Row>("SELECT * FROM group_sessions WHERE org_id = ? AND member_encounters LIKE ?", u.orgId, `%"${encId}"%`);
    return r ? toGroup(r) : undefined;
  },
  byEncounter: async (u: User, encId: string) => {
    const r = await get<Row>("SELECT * FROM group_sessions WHERE org_id = ? AND encounter_id = ?", u.orgId, encId);
    return r ? toGroup(r) : undefined;
  },
};

function assertClinician(u: User) {
  if (!["owner", "admin", "clinician"].includes(u.role)) throw new Forbidden("Only a clinician can run a group session");
}

export async function createGroup(u: User, input: { title?: string; memberIds?: string[]; scheduledAt?: string }) {
  assertClinician(u);
  const title = (input.title ?? "").trim();
  if (!title) throw new Invalid("Name the group");
  const ids = Array.from(new Set(input.memberIds ?? []));
  if (ids.length < 2) throw new Invalid("Choose at least two members");
  if (ids.length > 16) throw new Invalid("Groups are limited to 16 members");
  const members: GroupMember[] = [];
  for (const id of ids) {
    const p = await patients.get(u, id);
    if (!p) throw new Invalid("Patient not found");
    members.push({ id: p.id, name: p.name });
  }
  const firsts = members.map((m) => m.name.split(/\s+/)[0].toLowerCase());
  const dupes = firsts.filter((f, i) => firsts.indexOf(f) !== i);
  const enc = await encounters.create(u, { clinicianId: u.id, patientId: null, scheduledAt: input.scheduledAt ?? now(), visitType: "group", reason: `Group: ${title}`, templateId: "bh_group", setting: "in-person" });
  const id = uid("grp_");
  await run("INSERT INTO group_sessions (id, org_id, encounter_id, facilitator_id, title, members, assignments, member_encounters, created_at) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?)", id, u.orgId, enc.id, u.id, title.slice(0, 80), JSON.stringify(members), now());
  await audit.log(u, enc.id, "group.created", { groupId: id, members: members.length });
  return { group: (await groups.get(u, id))!, warning: dupes.length ? `Two members share the first name ${dupes[0]}; check speaker assignments by hand.` : null };
}

export async function groupDetail(u: User, id: string) {
  const g = await groups.get(u, id);
  if (!g) return null;
  const utts = await utterances.list(g.encounterId);
  const guessed = guessAssignments(utts, g.members);
  const assignments = { ...guessed, ...g.assignments };
  const enc = await encounters.get(u, g.encounterId);
  const memberNotes = await Promise.all(g.members.map(async (m) => {
    const eid = g.memberEncounters[m.id];
    const e = eid ? await encounters.get(u, eid) : undefined;
    return { memberId: m.id, encounterId: e?.id ?? null, status: e?.status ?? null };
  }));
  return {
    ...g,
    status: enc?.status ?? "scheduled",
    durationS: enc?.durationS ?? 0,
    utterances: utts.map((x) => ({ id: x.id, speaker: x.speaker, text: x.text, tStart: x.tStart, assigned: x.speaker === "clinician" ? null : assignments[x.id] ?? null, manual: x.id in g.assignments })),
    participation: participationCounts(utts, assignments, g.members),
    unassigned: utts.filter((x) => x.speaker !== "clinician" && !assignments[x.id]).length,
    memberNotes,
  };
}

export async function assign(u: User, id: string, utteranceId: string, memberId: string | null) {
  assertClinician(u);
  const g = await groups.get(u, id);
  if (!g) throw new Error("Group not found");
  if (memberId && !g.members.some((m) => m.id === memberId)) throw new Invalid("That patient is not in this group");
  if (!(await utterances.list(g.encounterId)).some((x) => x.id === utteranceId)) throw new Invalid("Line not found");
  await run("UPDATE group_sessions SET assignments = ? WHERE id = ?", JSON.stringify({ ...g.assignments, [utteranceId]: memberId }), id);
}

export async function createMemberNotes(u: User, id: string) {
  assertClinician(u);
  const g = await groups.get(u, id);
  if (!g) throw new Error("Group not found");
  const groupEnc = (await encounters.get(u, g.encounterId))!;
  const consent = await consents.latest(g.encounterId);
  if (!consent || consent.decision !== "granted") throw new Invalid("Record group consent before creating member notes");
  const utts = await utterances.list(g.encounterId);
  if (!utts.length) throw new Invalid("Record the group session first");
  const assignments = { ...guessAssignments(utts, g.members), ...g.assignments };
  const created: Record<string, string> = { ...g.memberEncounters };
  for (const m of g.members) {
    const existing = created[m.id] ? await encounters.get(u, created[m.id]) : undefined;
    if (existing?.status === "signed") continue;
    const lines = memberTranscript(utts, assignments, m, g.members);
    const encId = existing?.id ?? (await encounters.create(u, { clinicianId: g.facilitatorId, patientId: m.id, scheduledAt: groupEnc.scheduledAt, visitType: "group", reason: `Group psychotherapy: ${g.title} (${g.members.length} members)`, templateId: "bh_group", setting: "in-person" })).id;
    const enc = (await encounters.get(u, encId))!;
    if (!existing) await recordConsent(u, enc, { decision: "granted", method: consent.method, state: consent.state, othersPresent: true });
    await utterances.replaceAll(encId, lines.map((l) => ({ ...l, speakerSource: "manual" as const })));
    await encounters.update(u, encId, { status: "processing", startedAt: groupEnc.startedAt, endedAt: groupEnc.endedAt, durationS: groupEnc.durationS });
    await processEncounter(u, encId, { engine: "local" });
    created[m.id] = encId;
  }
  await run("UPDATE group_sessions SET member_encounters = ? WHERE id = ?", JSON.stringify(created), id);
  await audit.log(u, g.encounterId, "group.member_notes", { groupId: id, members: Object.keys(created).length });
  return created;
}
