import { createServer } from "node:net";

const PORT = Number(process.env.MOCK_MLLP_PORT || 3294);

createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    const s = buf.indexOf(0x0b);
    const e = buf.indexOf(0x1c);
    if (s < 0 || e < 0) return;
    const msg = buf.subarray(s + 1, e).toString("utf8");
    buf = Buffer.alloc(0);
    const msh = msg.split("\r")[0].split("|");
    const ack = [`MSH|^~\\&|${msh[4]}|${msh[5]}|${msh[2]}|${msh[3]}|20260101000000||ACK^T02^ACK|A${msh[9]}|P|2.5.1`, `MSA|AA|${msh[9]}`].join("\r");
    sock.write(Buffer.concat([Buffer.from([0x0b]), Buffer.from(ack), Buffer.from([0x1c, 0x0d])]));
  });
}).listen(PORT, () => console.log(`mock mllp on ${PORT}`));
