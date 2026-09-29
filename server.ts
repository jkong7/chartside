import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3100);
const hostname = process.env.HOSTNAME_BIND || "0.0.0.0";

const app = next({ dev, port, hostname });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
const { handleMediaStream } = await import("./src/lib/server/telephony/bridge");
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
