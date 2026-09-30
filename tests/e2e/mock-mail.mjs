import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.MOCK_MAIL_PORT || 3295);
const KEY = "test-sendgrid";
const messages = [];
const faxes = [];
const texts = [];
const media = new Map();
const mediaLog = { gets: [], deletes: [], unauthorized: 0 };
const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const numbers = [{ sid: "PN0000000000000000000000000000beef", phone_number: "+13125550199", voice_url: "", sms_url: "" }];

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  req.setEncoding("latin1");
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.method === "GET" && url.pathname === "/stats") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ sent: messages.length }));
    if (req.method === "GET" && url.pathname === "/messages") {
      const to = url.searchParams.get("to");
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(messages.filter((m) => !to || m.to === to)));
    }
    const twilioAuth = req.headers.authorization === `Basic ${Buffer.from("ACtest:test-twilio").toString("base64")}`;
    if (url.pathname === "/numbers" && req.method === "GET") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(numbers));
    if (/^\/2010-04-01\/Accounts\/[^/]+\/IncomingPhoneNumbers\.json$/.test(url.pathname) && req.method === "GET") {
      if (!twilioAuth) return res.writeHead(401).end("{}");
      const want = url.searchParams.get("PhoneNumber");
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ incoming_phone_numbers: numbers.filter((n) => !want || n.phone_number === want) }));
    }
    const pn = /^\/2010-04-01\/Accounts\/[^/]+\/IncomingPhoneNumbers\/(PN\w+)\.json$/.exec(url.pathname);
    if (pn && req.method === "POST") {
      if (!twilioAuth) return res.writeHead(401).end("{}");
      const n = numbers.find((x) => x.sid === pn[1]);
      if (!n) return res.writeHead(404).end("{}");
      const f = new URLSearchParams(raw);
      n.voice_url = f.get("VoiceUrl") ?? n.voice_url;
      n.sms_url = f.get("SmsUrl") ?? n.sms_url;
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(n));
    }
    if (req.method === "POST" && url.pathname === "/media") {
      const b = JSON.parse(raw || "{}");
      media.set(b.sid, { fixture: b.fixture || "visit.wav", contentType: b.contentType || "audio/wav", bytes: b.bytes || 0 });
      return res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ url: `http://localhost:${PORT}/2010-04-01/Accounts/ACtest/Messages/${b.messageSid || "MM0"}/Media/${b.sid}` }));
    }
    if (req.method === "GET" && url.pathname === "/media-log") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ...mediaLog, live: [...media.keys()] }));
    const md = /^\/2010-04-01\/Accounts\/[^/]+\/Messages\/[^/]+\/Media\/(ME\w+?)(\.json)?$/.exec(url.pathname);
    if (md) {
      if (!twilioAuth) {
        mediaLog.unauthorized++;
        return res.writeHead(401).end("{}");
      }
      const m = media.get(md[1]);
      if (req.method === "DELETE") {
        if (!md[2]) return res.writeHead(405).end("{}");
        mediaLog.deletes.push(md[1]);
        if (!m) return res.writeHead(404).end("{}");
        media.delete(md[1]);
        return res.writeHead(204).end();
      }
      if (req.method === "GET") {
        if (!m) return res.writeHead(404).end("{}");
        mediaLog.gets.push(md[1]);
        const body = m.bytes ? Buffer.alloc(m.bytes) : readFileSync(path.join(FIXTURES, m.fixture));
        return res.writeHead(200, { "content-type": m.contentType, "content-length": body.length }).end(body);
      }
    }
    if (req.method === "GET" && url.pathname === "/texts") {
      const to = url.searchParams.get("to");
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(texts.filter((m) => !to || m.to === to)));
    }
    if (req.method === "POST" && /^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(url.pathname)) {
      if (req.headers.authorization !== `Basic ${Buffer.from("ACtest:test-twilio").toString("base64")}`) return res.writeHead(401).end(JSON.stringify({ message: "bad auth" }));
      const f = new URLSearchParams(raw);
      if (!f.get("To") || !f.get("From") || !f.get("Body")) return res.writeHead(400).end(JSON.stringify({ message: "To, From and Body are required" }));
      const sid = `SM${String(texts.length + 1).padStart(32, "0")}`;
      texts.push({ sid, to: f.get("To"), from: f.get("From"), body: f.get("Body") });
      return res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ sid, status: "queued" }));
    }
    if (req.method === "GET" && url.pathname === "/faxes") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(faxes));
    if (req.method === "POST" && url.pathname === "/v2.1/faxes") {
      if (req.headers.authorization !== `Basic ${Buffer.from("test-fax-key:test-fax-secret").toString("base64")}`) return res.writeHead(401).end(JSON.stringify({ success: false, message: "bad auth" }));
      const to = /name="to"\r\n\r\n([^\r]+)/.exec(raw)?.[1];
      if (!to || !raw.includes("%PDF-")) return res.writeHead(422).end(JSON.stringify({ success: false, message: "to and a PDF file are required" }));
      faxes.push({ id: faxes.length + 1, to, bytes: raw.length });
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ success: true, message: "Fax queued", data: { id: faxes.length } }));
    }
    if (req.method === "POST" && url.pathname === "/v3/mail/send") {
      if (req.headers.authorization !== `Bearer ${KEY}`) return res.writeHead(401).end();
      const b = JSON.parse(raw || "{}");
      const to = b.personalizations?.[0]?.to?.[0]?.email;
      if (!to || !b.from?.email || !b.subject) return res.writeHead(400).end();
      const id = `msg_${messages.length + 1}`;
      messages.push({ id, to, from: b.from.email, subject: b.subject, body: b.content?.[0]?.value ?? "" });
      return res.writeHead(202, { "x-message-id": id }).end();
    }
    res.writeHead(404).end();
  });
}).listen(PORT, () => console.log(`mock mail on ${PORT}`));
