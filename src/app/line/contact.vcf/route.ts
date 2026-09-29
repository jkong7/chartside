export function GET() {
  const number = process.env.CHARTSIDE_LINE_NUMBER || "";
  const url = `${(process.env.CHARTSIDE_PUBLIC_URL || "").replace(/\/$/, "")}/go/phone`;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:Chartside Scribe", "N:Scribe;Chartside;;;", "ORG:Chartside", number ? `TEL;TYPE=WORK,VOICE:${number}` : "", `URL:${url}`, "NOTE:Call before a visit and set the phone down. Hang up and your note is texted to you.", "END:VCARD"].filter(Boolean);
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/vcard; charset=utf-8", "content-disposition": 'attachment; filename="Chartside Scribe.vcf"' } });
}
