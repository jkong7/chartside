import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_DG_PORT || 3299);
const KEY = "test-key";
const TOKEN = "mock-jwt";

const FINAL = [
  [0, 0.4, 2.3, "Hi James, what brings you in today?"],
  [1, 3.0, 7.2, "I have had a dry cough for about five days, and it is worse at night."],
  [0, 7.9, 9.9, "Any fever or shortness of breath?"],
  [1, 10.5, 12.6, "No fever, and no trouble breathing."],
  [0, 13.2, 17.4, "Your lungs sound clear. This looks like a viral upper respiratory infection."],
  [0, 18.0, 21.8, "Drink plenty of fluids, and follow up in one week if you are not better."],
];

const LIVE = [
  [0, 0.4, 2.3, "Hi James, what brings you in today?"],
  [1, 3.0, 7.2, "I've had a dry cough for about five days."],
  [0, 7.9, 9.9, "Any fever or shortness of breath?"],
  [1, 10.5, 12.6, "No, no fever."],
];

function words(spk, start, end, text) {
  const ws = text.split(/\s+/);
  const step = (end - start) / ws.length;
  return ws.map((w, i) => ({ word: w.toLowerCase().replace(/[^a-z']/g, ""), punctuated_word: w, start: start + i * step, end: start + (i + 1) * step, confidence: 0.95, speaker: spk, language: "en" }));
}

const stats = { grants: 0, prerecorded: 0, lastBytes: 0, wsConnections: 0, wsAudioMessages: 0 };

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let size = 0;
  req.on("data", (c) => (size += c.length));
  req.on("end", () => {
    if (url.pathname === "/stats") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(stats));
    if (req.headers.authorization !== `Token ${KEY}`) return res.writeHead(401).end(JSON.stringify({ err_msg: "bad key" }));
    if (req.method === "POST" && url.pathname === "/v1/auth/grant") {
      stats.grants++;
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: TOKEN, expires_in: 60 }));
    }
    if (req.method === "POST" && url.pathname === "/v1/listen") {
      if (!/^audio\//.test(req.headers["content-type"] || "") || size < 1000 || url.searchParams.get("diarize") !== "true" || url.searchParams.get("utterances") !== "true") {
        return res.writeHead(400).end(JSON.stringify({ err_msg: "bad request" }));
      }
      stats.prerecorded++;
      stats.lastBytes = size;
      const utterances = FINAL.map(([spk, s, e, t], i) => ({ id: `u${i}`, start: s, end: e, confidence: 0.93, channel: 0, transcript: t, speaker: spk, words: words(spk, s, e, t) }));
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ metadata: { request_id: "mock" }, results: { channels: [], utterances } }));
    }
    res.writeHead(404).end();
  });
});

const wss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has("bearer") ? "bearer" : false) });
server.on("upgrade", (req, socket, head) => {
  const protos = (req.headers["sec-websocket-protocol"] || "").split(",").map((s) => s.trim());
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/v1/listen" || protos[0] !== "bearer" || protos[1] !== TOKEN || url.searchParams.get("diarize") !== "true") {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    stats.wsConnections++;
    let sent = 0;
    let timer = null;
    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const msg = JSON.parse(data.toString());
        if (msg.type === "CloseStream") ws.close();
        return;
      }
      stats.wsAudioMessages++;
      if (timer) return;
      timer = setInterval(() => {
        if (sent >= LIVE.length || ws.readyState !== 1) return clearInterval(timer);
        const [spk, s, e, t] = LIVE[sent++];
        ws.send(JSON.stringify({ type: "Results", channel_index: [0, 1], start: s, duration: e - s, is_final: false, speech_final: false, channel: { alternatives: [{ transcript: t.slice(0, 12), confidence: 0.8, words: [] }] } }));
        ws.send(JSON.stringify({ type: "Results", channel_index: [0, 1], start: s, duration: e - s, is_final: true, speech_final: true, channel: { alternatives: [{ transcript: t, confidence: 0.95, words: words(spk, s, e, t) }] } }));
      }, 700);
    });
    ws.on("close", () => timer && clearInterval(timer));
  });
});

server.listen(PORT, () => console.log(`mock deepgram on ${PORT}`));
