import { describe, expect, it } from "vitest";
import { interleave, mulawDecode, mulawEncode, pcmFromWav, resample, wavFromPcm } from "../../src/lib/server/telephony/mulaw";
import { expectedSignature, twiml, validSignature, wsOrigin } from "../../src/lib/server/telephony/twilio";

describe("mulaw codec", () => {
  it("round-trips speech-level samples within G.711 error", () => {
    const pcm = new Int16Array(800);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 8000));
    const back = mulawDecode(mulawEncode(pcm));
    let maxErr = 0;
    for (let i = 0; i < pcm.length; i++) maxErr = Math.max(maxErr, Math.abs(back[i] - pcm[i]) / Math.max(256, Math.abs(pcm[i])));
    expect(maxErr).toBeLessThan(0.07);
  });

  it("maps silence to 0xFF and back to zero", () => {
    expect(mulawEncode(new Int16Array([0]))[0]).toBe(0xff);
    expect(mulawDecode(new Uint8Array([0xff]))[0]).toBe(0);
  });

  it("clips out-of-range samples without throwing", () => {
    const out = mulawDecode(mulawEncode(new Int16Array([32767, -32768])));
    expect(out[0]).toBeGreaterThan(30000);
    expect(out[1]).toBeLessThan(-30000);
  });
});

describe("wav helpers", () => {
  it("writes and reads a mono 8 kHz file", () => {
    const pcm = new Int16Array([1, -2, 300, -400]);
    const wav = wavFromPcm(pcm, 8000);
    expect(wav.length).toBe(44 + 8);
    const back = pcmFromWav(wav);
    expect(back.sampleRate).toBe(8000);
    expect(Array.from(back.pcm)).toEqual([1, -2, 300, -400]);
  });

  it("downmixes stereo and writes interleaved dual channel", () => {
    const stereo = wavFromPcm(interleave(new Int16Array([100, 200]), new Int16Array([300, 400])), 8000, 2);
    expect(stereo.readUInt16LE(22)).toBe(2);
    expect(Array.from(pcmFromWav(stereo).pcm)).toEqual([200, 300]);
  });

  it("rejects non-wav input", () => {
    expect(() => pcmFromWav(Buffer.from("not audio at all, definitely"))).toThrow();
  });

  it("resamples 16 kHz to 8 kHz and back", () => {
    const pcm = new Int16Array(1600).fill(1000);
    const down = resample(pcm, 16000, 8000);
    expect(down.length).toBe(800);
    expect(down[10]).toBe(1000);
    expect(resample(down, 8000, 16000).length).toBe(1600);
  });
});

describe("twilio helpers", () => {
  it("matches Twilio's documented signature example", () => {
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    const sig = expectedSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params);
    expect(sig).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(validSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params, sig)).toBe(true);
    expect(validSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params, "bad")).toBe(false);
    expect(validSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params, null)).toBe(false);
  });

  it("escapes TwiML and emits stream parameters", () => {
    const xml = twiml([{ say: "Hi <Dr> & co" }, { stream: { url: "wss://x.test/api/voice/stream", params: { callToken: "a&b" } } }]);
    expect(xml).toContain("Hi &lt;Dr&gt; &amp; co");
    expect(xml).toContain('<Parameter name="callToken" value="a&amp;b"/>');
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it("builds websocket origins", () => {
    expect(wsOrigin("https://a.run.app")).toBe("wss://a.run.app");
    expect(wsOrigin("http://localhost:3100")).toBe("ws://localhost:3100");
  });
});
