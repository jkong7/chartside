const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const SIZE = 11;
const LEAD = 15;

const WIDTHS: Record<string, number> = { " ": 278, i: 222, l: 222, j: 222, f: 278, t: 278, r: 333, I: 278, ".": 278, ",": 278, ":": 278, ";": 278, "'": 191, "(": 333, ")": 333, "-": 333, m: 833, w: 722, M: 833, W: 944 };

function charWidth(c: string, bold: boolean) {
  const w = WIDTHS[c] ?? (/[A-Z]/.test(c) ? 667 : /[0-9]/.test(c) ? 556 : 556);
  return (bold ? w * 1.05 : w) / 1000;
}

function textWidth(s: string, size: number, bold = false) {
  let w = 0;
  for (const c of s) w += charWidth(c, bold);
  return w * size;
}

export function wrap(text: string, width: number, size = SIZE, bold = false) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const indent = /^\s+/.exec(para)?.[0] ?? "";
    let line = "";
    for (const word of para.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : `${indent}${word}`;
      if (textWidth(next, size, bold) > width && line) {
        out.push(line);
        line = `${indent}${indent ? "  " : ""}${word}`;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const WIN: Record<string, number> = { "•": 0x95, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "…": 0x85, "€": 0x80, "™": 0x99 };

function pdfString(s: string) {
  let out = "";
  for (const c of s) {
    const code = WIN[c] ?? c.charCodeAt(0);
    if (c === "(" || c === ")" || c === "\\") out += `\\${c}`;
    else if (code > 126 || code < 32) out += code <= 255 ? `\\${code.toString(8).padStart(3, "0")}` : "?";
    else out += c;
  }
  return `(${out})`;
}

export function textPdf(input: { title: string; letterhead?: string; body: string; footer?: string }) {
  const width = PAGE_W - MARGIN * 2;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN;
  };
  const line = (s: string, size: number, bold = false, color = "0 0 0") => {
    if (y < MARGIN + 30) newPage();
    if (s) ops.push(`BT ${color} rg /${bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td ${pdfString(s)} Tj ET`);
    y -= size === SIZE ? LEAD : size + 6;
  };
  if (input.letterhead) {
    line(input.letterhead, 9, true, "0.06 0.42 0.36");
    ops.push(`0.8 0.78 0.73 RG 0.6 w ${MARGIN} ${(y + 8).toFixed(1)} m ${PAGE_W - MARGIN} ${(y + 8).toFixed(1)} l S`);
    y -= 6;
  }
  for (const l of wrap(input.title, width, 14, true)) line(l, 14, true);
  y -= 4;
  for (const l of wrap(input.body, width)) line(l, SIZE);
  newPage();

  const objects: string[] = [];
  const add = (o: string) => objects.push(o) - 1 + 1;
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((p, i) => {
    const footer = `BT 0.45 0.45 0.45 rg /F1 8 Tf ${MARGIN} 40 Td ${pdfString(`${input.footer ? `${input.footer}  ·  ` : ""}Page ${i + 1} of ${pages.length}`)} Tj ET`;
    const stream = [...p, footer].join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Producer (Chartside) /Title ${pdfString(input.title)} >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
