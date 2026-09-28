export function addBusinessDays(from: Date, n: number) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  d.setHours(23, 59, 59, 999);
  return d;
}

const dayDiff = (a: Date, b: Date) => {
  const x = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const y = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((y - x) / 86400000);
};

export interface TcmInput {
  dischargeAt: string;
  contactAt: string | null;
  attempts: number;
  firstAttemptAt: string | null;
  visitAt: string;
  mdm: "straightforward" | "low" | "moderate" | "high";
  medRec: boolean;
}

export interface TcmResult {
  code: "99495" | "99496" | null;
  daysAfterDischarge: number;
  met: string[];
  unmet: string[];
}

export function tcmCode(x: TcmInput): TcmResult {
  const dc = new Date(x.dischargeAt);
  const visit = new Date(x.visitAt);
  const days = dayDiff(dc, visit);
  const met: string[] = [];
  const unmet: string[] = [];
  const deadline = addBusinessDays(dc, 2);
  const contactOk = (x.contactAt && new Date(x.contactAt) <= deadline) || (x.attempts >= 2 && x.firstAttemptAt !== null && new Date(x.firstAttemptAt) <= deadline);
  (contactOk ? met : unmet).push(x.contactAt ? `Interactive contact ${new Date(x.contactAt) <= deadline ? "within" : "after"} 2 business days of discharge` : x.attempts >= 2 ? "Two or more timely contact attempts" : "Interactive contact within 2 business days (not documented)");
  if (days < 1 || days > 29) unmet.push(`Visit on day ${days} after discharge (must fall within the 30-day period, after discharge)`);
  (x.medRec ? met : unmet).push(x.medRec ? "Medication reconciliation at or before this visit" : "Medication reconciliation not documented");
  const high = x.mdm === "high";
  const modPlus = high || x.mdm === "moderate";
  if (!modPlus) unmet.push(`Medical decision making is ${x.mdm}; TCM needs at least moderate`);
  let code: TcmResult["code"] = null;
  if (!unmet.length) {
    if (high && days <= 7) code = "99496";
    else if (days <= 14) code = "99495";
    else unmet.push(`Face-to-face visit on day ${days}; must be within 14 days (7 for high complexity)`);
  }
  if (code) met.push(code === "99496" ? `High-complexity MDM with a visit on day ${days} (within 7 days)` : `${high ? "High" : "Moderate"}-complexity MDM with a visit on day ${days} (within 14 days)`);
  return { code, daysAfterDischarge: days, met, unmet };
}

export const MED_REC = /\b(?:reconcil\w*|went (?:over|through) (?:your|the|all (?:of )?(?:your|the)) (?:discharge )?(?:med(?:ication)?s|medication list)|review(?:ed)? (?:your|the) discharge (?:med(?:ication)?s|medication list)|compare(?:d)? (?:your|the) (?:hospital|discharge) (?:med(?:ication)?s|list))\b/i;
