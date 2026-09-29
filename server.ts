import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3100);
const hostname = process.env.HOSTNAME_BIND || "0.0.0.0";

const app = next({ dev, port });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
const { handleMediaStream } = await import("./src/lib/server/telephony/bridge");
const { LINES } = await import("./src/lib/server/telephony/call");
const { phoneSpeechReady, warmPhrases } = await import("./src/lib/server/telephony/speech");
if (phoneSpeechReady() && !process.env.CHARTSIDE_SKIP_WARM) void warmPhrases(Object.values(LINES));
const { recoverStalledCaptures } = await import("./src/lib/server/recovery");
const { purgeGuests } = await import("./src/lib/server/guest");
const sweep = async () => {
  await recoverStalledCaptures().catch((err) => console.error("capture recovery failed", err));
  await purgeGuests().catch((err) => console.error("guest purge failed", err));
};
setTimeout(sweep, 30_000).unref();
setInterval(sweep, 5 * 60_000).unref();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const openByIp = new Map<string, number>();
let openTotal = 0;
const MAX_PER_IP = Number(process.env.CHARTSIDE_WS_PER_IP || 8);
const MAX_TOTAL = Number(process.env.CHARTSIDE_WS_TOTAL || 60);
const hopsFor = (h: string | string[] | undefined) => (Array.isArray(h) ? h.join(",") : h ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const server = createServer((req, res) => handle(req, res));
server.on("upgrade", (req, socket, head) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/api/voice/stream") {
    const hops = hopsFor(req.headers["x-forwarded-for"]);
    const ip = hops[Math.max(0, hops.length - Math.max(1, Number(process.env.CHARTSIDE_PROXY_HOPS || 1)))] || req.socket.remoteAddress || "local";
    if (openTotal >= MAX_TOTAL || (openByIp.get(ip) ?? 0) >= MAX_PER_IP) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      openTotal++;
      openByIp.set(ip, (openByIp.get(ip) ?? 0) + 1);
      ws.on("close", () => {
        openTotal--;
        const n = (openByIp.get(ip) ?? 1) - 1;
        if (n <= 0) openByIp.delete(ip);
        else openByIp.set(ip, n);
      });
      handleMediaStream(ws);
    });
    return;
  }
  upgrade(req, socket, head);
});
server.listen(port, hostname, () => console.log(`chartside ready on http://${hostname}:${port}${dev ? " (dev)" : ""}`));
