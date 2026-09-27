import { deleteAudio, recording, saveChunk } from "@/lib/server/audio";
import { authed, fail, json } from "@/lib/server/http";
import { audioChunks, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status !== "recording" && enc.status !== "paused") return fail("Capture is not active for this visit", 409);
  const url = new URL(req.url);
  const seq = Number(url.searchParams.get("seq"));
  const t = Number(url.searchParams.get("t") ?? 0);
  const mime = req.headers.get("content-type") ?? "audio/webm";
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length) return fail("Empty audio chunk");
  try {
    const count = await saveChunk(enc.id, seq, t, mime, data);
    return json({ ok: true, seq, chunks: count }, 201);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not store audio", 400);
  }
});

export const GET = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const rec = await recording(enc.id);
  if (!rec) return fail("No audio is stored for this visit", 404);
  const range = req.headers.get("range");
  const total = rec.buffer.length;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new Response(new Uint8Array(rec.buffer.subarray(start, end + 1)), {
      status: 206,
      headers: { "content-type": rec.mime, "content-range": `bytes ${start}-${end}/${total}`, "accept-ranges": "bytes", "content-length": String(end - start + 1), "cache-control": "private, no-store" },
    });
  }
  return new Response(new Uint8Array(rec.buffer), { headers: { "content-type": rec.mime, "accept-ranges": "bytes", "content-length": String(total), "cache-control": "private, no-store" } });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  await deleteAudio(user, enc.id, "deleted by clinician");
  return json({ ok: true, chunks: (await audioChunks.list(enc.id)).length });
});
