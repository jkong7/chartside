import { describe, expect, it } from "vitest";

function chunked(chunks: number, size: number, type = "audio/webm", url = "http://localhost/api/capture") {
  let sent = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      pulls++;
      if (sent >= chunks) return c.close();
      sent++;
      c.enqueue(new Uint8Array(size).fill(1));
    },
  });
  const req = new Request(url, { method: "POST", headers: { "content-type": type }, body, duplex: "half" } as RequestInit);
  return { req, pulled: () => pulls };
}

describe("capture body limit", () => {
  it("stops reading a chunked upload with no length once it passes the limit", async () => {
    const { readCaptureRequest } = await import("@/lib/server/capture");
    const { req, pulled } = chunked(1000, 64 * 1024);
    await expect(readCaptureRequest(req, 256 * 1024)).rejects.toMatchObject({ status: 413 });
    expect(pulled()).toBeLessThan(10);
  });

  it("applies the limit to multipart bodies without a length too", async () => {
    const { readCaptureRequest } = await import("@/lib/server/capture");
    const { req } = chunked(1000, 64 * 1024, "multipart/form-data; boundary=x");
    await expect(readCaptureRequest(req, 128 * 1024)).rejects.toMatchObject({ status: 413 });
  });

  it("refuses a declared length over the limit before reading", async () => {
    const { readCaptureRequest } = await import("@/lib/server/capture");
    const req = new Request("http://localhost/api/capture", { method: "POST", headers: { "content-type": "audio/webm", "content-length": String(10 * 1024 * 1024) }, body: new Uint8Array(10) });
    await expect(readCaptureRequest(req, 1024 * 1024)).rejects.toMatchObject({ status: 413 });
  });

  it("still reads uploads under the limit, raw, multipart and JSON", async () => {
    const { readCaptureRequest } = await import("@/lib/server/capture");
    const raw = await readCaptureRequest(chunked(3, 1000).req, 1024 * 1024);
    expect(raw.audio!.length).toBe(3000);
    expect(raw.mime).toBe("audio/webm");
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array(500).fill(2)], { type: "audio/mp4" }), "a.m4a");
    form.set("finish", "true");
    const mp = await readCaptureRequest(new Request("http://localhost/api/capture?seq=2", { method: "POST", body: form }));
    expect(mp.audio!.length).toBe(500);
    expect(mp.opts).toMatchObject({ finish: "true", seq: "2" });
    const js = await readCaptureRequest(new Request("http://localhost/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ finish: true }) }));
    expect(js).toMatchObject({ audio: null, opts: { finish: "true" } });
    const bad = await readCaptureRequest(new Request("http://localhost/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
    expect(bad.audio).toBeNull();
  });
});
