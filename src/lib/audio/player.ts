export class SegmentPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<AudioBuffer | null> | null = null;
  private node: AudioBufferSourceNode | null = null;

  constructor(private url: string) {}

  private async load() {
    if (this.buffer) return this.buffer;
    this.loading ??= (async () => {
      const res = await fetch(this.url, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      this.ctx ??= new AudioContext();
      try {
        this.buffer = await this.ctx.decodeAudioData(data);
      } catch {
        this.buffer = null;
      }
      return this.buffer;
    })();
    return this.loading;
  }

  async play(start: number, end: number, onEnd?: () => void) {
    this.stop();
    const buf = await this.load();
    if (!buf || !this.ctx) return false;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const from = Math.max(0, Math.min(start, buf.duration - 0.05));
    const dur = Math.max(0.3, Math.min(end, buf.duration) - from);
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.ctx.destination);
    node.onended = () => {
      if (this.node === node) this.node = null;
      onEnd?.();
    };
    node.start(0, from, dur);
    this.node = node;
    return true;
  }

  stop() {
    try {
      this.node?.stop();
    } catch {
      this.node = null;
    }
    this.node = null;
  }

  async duration() {
    return (await this.load())?.duration ?? 0;
  }
}
