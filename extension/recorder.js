(() => {
  const pick = () => {
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    return "audio/webm";
  };

  class Recorder {
    constructor(base, onState, opts = {}) {
      this.base = base.replace(/\/$/, "");
      this.onState = onState || (() => {});
      this.opts = opts;
      this.encId = null;
      this.queue = Promise.resolve();
      this.started = 0;
      this.pausedFor = 0;
      this.pausedAt = 0;
      this.error = null;
    }

    seconds() {
      if (!this.started) return 0;
      const pausedNow = this.pausedAt ? Date.now() - this.pausedAt : 0;
      return Math.max(0, Math.floor((Date.now() - this.started - this.pausedFor - pausedNow) / 1000));
    }

    upload(blob, finish) {
      this.queue = this.queue.then(async () => {
        if (this.error) return;
        const q = new URLSearchParams({ consent: "granted", finish: String(finish), channel: "extension", durationS: String(Math.max(1, this.seconds())) });
        const url = this.encId ? `${this.base}/api/capture/${this.encId}?${q}` : `${this.base}/api/capture?${q}`;
        for (let attempt = 0; attempt < 4; attempt++) {
          const r = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": this.mime.split(";")[0] }, body: blob.size ? blob : null }).catch(() => null);
          if (r && r.ok) {
            const j = await r.json();
            if (!this.encId) this.encId = j.encounterId;
            return;
          }
          if (r && r.status === 401) throw new Error("signin");
          if (r && r.status < 500) throw new Error((await r.json().catch(() => ({}))).error || `Upload failed (${r.status})`);
          await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
        }
        throw new Error("Couldn't reach Chartside");
      });
      this.queue.catch((err) => {
        this.error = err;
        this.onState({ phase: "failed", error: err.message });
      });
      return this.queue;
    }

    async start() {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      this.mime = pick();
      this.rec = new MediaRecorder(this.stream, { mimeType: this.mime, audioBitsPerSecond: 32000 });
      this.rec.ondataavailable = (e) => e.data.size && this.upload(e.data, false);
      this.started = Date.now();
      this.rec.start(this.opts.timeslice || 5000);
      this.onState({ phase: "recording" });
    }

    pause() {
      if (this.rec && this.rec.state === "recording") {
        this.rec.pause();
        this.pausedAt = Date.now();
        this.onState({ phase: "paused" });
      }
    }

    resume() {
      if (this.rec && this.rec.state === "paused") {
        this.rec.resume();
        this.pausedFor += Date.now() - this.pausedAt;
        this.pausedAt = 0;
        this.onState({ phase: "recording" });
      }
    }

    async stop() {
      this.onState({ phase: "finishing" });
      if (this.pausedAt) this.resume();
      await new Promise((resolve) => {
        this.rec.onstop = resolve;
        this.rec.stop();
      });
      this.stream.getTracks().forEach((t) => t.stop());
      await this.upload(new Blob([], { type: this.mime }), true);
      if (this.error) throw this.error;
      if (!this.encId) throw new Error("Nothing was recorded");
      for (let i = 0; i < 160; i++) {
        const s = await (await fetch(`${this.base}/api/capture/${this.encId}`, { credentials: "include" })).json();
        if (s.status === "ready" || s.status === "signed") {
          this.onState({ phase: "ready", encounterId: this.encId });
          return this.encId;
        }
        if (s.status === "failed") throw new Error(s.error || "Drafting failed");
        await new Promise((res) => setTimeout(res, this.opts.pollMs || 1500));
      }
      throw new Error("Still drafting. Check again in a minute.");
    }
  }

  globalThis.ChartsideRecorder = Recorder;
})();
