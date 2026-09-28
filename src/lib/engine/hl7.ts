export interface MdmInput {
  controlId: string;
  sendingApp: string;
  sendingFacility: string;
  receivingApp: string;
  receivingFacility: string;
  at: Date;
  patient: { mrn: string; name: string; dob: string; sex: string };
  visitNumber: string;
  clinician: { id: string; name: string };
  documentId: string;
  documentType: string;
  signedAt: Date;
  lines: string[];
  sensitive?: boolean;
}

const esc = (s: string) => s.replace(/\\/g, "\\E\\").replace(/\|/g, "\\F\\").replace(/\^/g, "\\S\\").replace(/&/g, "\\T\\").replace(/~/g, "\\R\\").replace(/[\r\n]+/g, " ");

export function hl7Time(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function buildMdmT02(x: MdmInput) {
  const [first, ...rest] = x.patient.name.trim().split(/\s+/);
  const last = rest.join(" ") || first;
  const [cFirst, ...cRest] = x.clinician.name.replace(/^Dr\.?\s+/i, "").split(/\s+/);
  const segs = [
    `MSH|^~\\&|${esc(x.sendingApp)}|${esc(x.sendingFacility)}|${esc(x.receivingApp)}|${esc(x.receivingFacility)}|${hl7Time(x.at)}||MDM^T02^MDM_T02|${x.controlId}|P|2.5.1`,
    `EVN|T02|${hl7Time(x.at)}`,
    `PID|1||${esc(x.patient.mrn)}^^^${esc(x.sendingFacility)}^MR||${esc(last)}^${esc(first)}||${x.patient.dob.replace(/-/g, "")}|${x.patient.sex === "F" || x.patient.sex === "M" ? x.patient.sex : "U"}`,
    `PV1|1|O|||||${esc(x.clinician.id)}^${esc(cRest.join(" ") || cFirst)}^${esc(cFirst)}||||||||||||${esc(x.visitNumber)}`,
    `TXA|1|${esc(x.documentType)}|TX|${hl7Time(x.signedAt)}|${esc(x.clinician.id)}^${esc(cRest.join(" ") || cFirst)}^${esc(cFirst)}||${hl7Time(x.signedAt)}|||||${esc(x.documentId)}||||||AU||AV${x.sensitive ? "|||R" : ""}`,
    ...x.lines.map((l, i) => `OBX|${i + 1}|TX|${esc(x.documentType)}^Clinical note^L||${esc(l)}||||||F`),
  ];
  return segs.join("\r");
}

export const VT = 0x0b;
export const FS = 0x1c;
export const CR = 0x0d;

export function frame(msg: string) {
  return Buffer.concat([Buffer.from([VT]), Buffer.from(msg, "utf8"), Buffer.from([FS, CR])]);
}

export function unframe(buf: Buffer) {
  const start = buf.indexOf(VT);
  const end = buf.indexOf(FS);
  if (start < 0 || end < 0 || end < start) return null;
  return buf.subarray(start + 1, end).toString("utf8");
}

export function parseAck(msg: string) {
  const msa = msg.split("\r").find((s) => s.startsWith("MSA|"));
  if (!msa) return { code: "?", controlId: "", text: "No MSA segment" };
  const f = msa.split("|");
  return { code: f[1] ?? "?", controlId: f[2] ?? "", text: f[3] ?? "" };
}

export function buildAck(msg: string, code = "AA") {
  const msh = msg.split("\r")[0].split("|");
  return [`MSH|^~\\&|${msh[4] ?? ""}|${msh[5] ?? ""}|${msh[2] ?? ""}|${msh[3] ?? ""}|${hl7Time(new Date())}||ACK^T02^ACK|ACK${msh[9] ?? ""}|P|2.5.1`, `MSA|${code}|${msh[9] ?? ""}`].join("\r");
}
