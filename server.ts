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
const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

const server = createServer((req, res) => handle(req, res));
server.on("upgrade", (req, socket, head) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/api/voice/stream") {
    wss.handleUpgrade(req, socket, head, (ws) => handleMediaStream(ws));
    return;
  }
  upgrade(req, socket, head);
});
server.listen(port, hostname, () => console.log(`chartside ready on http://${hostname}:${port}${dev ? " (dev)" : ""}`));
