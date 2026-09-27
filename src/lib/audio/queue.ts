export interface ChunkRecord {
  key: string;
  encId: string;
  seq: number;
  tMs: number;
  mime: string;
  blob: Blob;
}

export interface QueueState {
  uploaded: number;
  pending: number;
  online: boolean;
  lastError: string | null;
}

const DB = "chartside-audio";
const STORE = "chunks";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" }).createIndex("encId", "encId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function idb<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class UploadQueue {
  private mem = new Map<string, ChunkRecord>();
  private db: Promise<IDBDatabase | null>;
  private flushing = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  state: QueueState = { uploaded: 0, pending: 0, online: true, lastError: null };

  constructor(private encId: string, private onState: (s: QueueState) => void, private upload: (c: ChunkRecord) => Promise<void>) {
    this.db = openDb();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
      this.state.online = navigator.onLine;
    }
  }

  private onOnline = () => {
    this.set({ online: true });
    this.flush();
  };

  private onOffline = () => this.set({ online: false });

  private set(p: Partial<QueueState>) {
    this.state = { ...this.state, ...p };
    this.onState(this.state);
  }

  async restore() {
    const db = await this.db;
    if (!db) return;
    const rows = await idb<ChunkRecord[]>(db, "readonly", (s) => s.index("encId").getAll(this.encId));
    for (const r of rows) this.mem.set(r.key, r);
    this.set({ pending: this.mem.size });
    if (rows.length) this.flush();
  }

  async enqueue(c: Omit<ChunkRecord, "key" | "encId">) {
    const rec: ChunkRecord = { ...c, key: `${this.encId}:${c.seq}`, encId: this.encId };
    this.mem.set(rec.key, rec);
    const db = await this.db;
    if (db) await idb(db, "readwrite", (s) => s.put(rec)).catch(() => undefined);
    this.set({ pending: this.mem.size });
    this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const items = [...this.mem.values()].sort((a, b) => a.seq - b.seq);
      for (const c of items) {
        await this.upload(c);
        this.mem.delete(c.key);
        const db = await this.db;
        if (db) await idb(db, "readwrite", (s) => s.delete(c.key)).catch(() => undefined);
        this.backoff = 1000;
        this.set({ uploaded: this.state.uploaded + 1, pending: this.mem.size, lastError: null });
      }
    } catch (err) {
      this.set({ lastError: err instanceof Error ? err.message : "Upload failed", pending: this.mem.size });
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => this.flush(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
    } finally {
      this.flushing = false;
    }
  }

  async drain(timeoutMs = 15000) {
    const until = Date.now() + timeoutMs;
    while (this.mem.size && Date.now() < until) {
      await this.flush();
      if (this.mem.size) await new Promise((r) => setTimeout(r, 400));
    }
    return this.mem.size === 0;
  }

  dispose() {
    if (this.retry) clearTimeout(this.retry);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
  }
}
