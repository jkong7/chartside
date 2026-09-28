import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_MAIL_PORT || 3295);
const KEY = "test-sendgrid";
const messages = [];
const faxes = [];

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
