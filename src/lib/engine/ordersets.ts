import type { Chart, OrderAlert, StagedOrder } from "../types";
import { ORDERABLES, REFERRALS } from "./lexicon";

export interface OrderSetItem {
  kind: StagedOrder["kind"];
  name: string;
  detail?: string;
}

export interface OrderSet {
  id: string;
  name: string;
  scope: "system" | "org" | "personal";
  items: OrderSetItem[];
}

const cat = (name: string): OrderSetItem => {
  const o = ORDERABLES.find((x) => x.name === name);
  if (!o) throw new Error(`Unknown orderable ${name}`);
  return { kind: o.kind, name: o.name };
};
const ref = (name: string): OrderSetItem => ({ kind: "referral", name: `Referral to ${name}` });

export const SYSTEM_SETS: OrderSet[] = [
  { id: "sys_dm", name: "Diabetes annual", scope: "system", items: [cat("Hemoglobin A1c"), cat("Lipid panel"), cat("Comprehensive metabolic panel"), cat("Urine microalbumin/creatinine ratio"), ref("Ophthalmology"), ref("Podiatry")] },
  { id: "sys_htn", name: "Hypertension follow-up", scope: "system", items: [cat("Basic metabolic panel"), cat("Lipid panel"), cat("Urinalysis"), cat("12-lead ECG")] },
  { id: "sys_fatigue", name: "Fatigue workup", scope: "system", items: [cat("Complete blood count"), cat("Comprehensive metabolic panel"), cat("TSH"), cat("Iron studies"), cat("Vitamin B12")] },
  { id: "sys_chestpain", name: "Chest pain, office evaluation", scope: "system", items: [cat("12-lead ECG"), cat("Chest X-ray, 2 views"), cat("Complete blood count"), cat("Basic metabolic panel"), ref("Cardiology")] },
  { id: "sys_uti", name: "Urinary symptoms", scope: "system", items: [cat("Urinalysis"), cat("Urine culture")] },
  { id: "sys_adult_prev", name: "Adult preventive, 50 to 75", scope: "system", items: [cat("Lipid panel"), cat("Hemoglobin A1c"), cat("Fecal immunochemical test (FIT)"), cat("Zoster recombinant vaccine")] },
];

export const CATALOG: OrderSetItem[] = [...ORDERABLES.map((o) => ({ kind: o.kind as StagedOrder["kind"], name: o.name })), ...REFERRALS.map((r) => ref(r.name))];

export function stagedFrom(item: OrderSetItem, chart: Chart | null | undefined, at: Date, setName: string): Omit<StagedOrder, "id"> {
  const o = ORDERABLES.find((x) => x.name === item.name);
  const alerts: OrderAlert[] = [];
  const recent = chart?.labs?.find((l) => item.name.toLowerCase().includes(l.name.toLowerCase().split(" ")[0]) || l.name.toLowerCase().includes(item.name.toLowerCase().split(" ")[0]));
  if (recent && item.kind === "lab") {
    const days = Math.round((at.getTime() - new Date(recent.date).getTime()) / 86400000);
    if (days >= 0 && days < 90) alerts.push({ level: "info", message: `Last resulted ${days} days ago (${recent.value}).` });
  }
  if (item.kind === "vaccine" && (chart?.immunizations ?? []).some((v) => v.name.toLowerCase().includes(item.name.toLowerCase().split(" ")[0]))) alerts.push({ level: "warn", message: "A dose is already on the immunization record. Confirm it is due." });
  return { kind: item.kind, name: item.name, detail: [item.detail, o?.cpt ? `CPT ${o.cpt}` : "", `From order set: ${setName}`].filter(Boolean).join(" · "), status: alerts.some((a) => a.level !== "info") ? "staged" : "accepted", evidence: [], alerts, problem: "" };
}

export function validItems(items: OrderSetItem[]) {
  return items.filter((i) => CATALOG.some((c) => c.name === i.name && c.kind === i.kind)).slice(0, 25);
}
