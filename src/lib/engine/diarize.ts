import type { Speaker, Utterance } from "../types";
import { speakerScore } from "./extract";

export interface SpeakerGroup {
  key: string;
  utterances: Utterance[];
}

export function assignRoles(groups: SpeakerGroup[], all: Utterance[]): Record<string, Speaker> {
  const roles: Record<string, Speaker> = {};
  if (!groups.length) return roles;
  const stats = groups.map((g) => {
    const score = g.utterances.reduce((n, u) => n + speakerScore(u.text), 0) / Math.max(1, g.utterances.length);
    let mirrors = 0;
    for (const u of g.utterances) {
      const idx = all.findIndex((x) => x.id === u.id);
      const prev = idx > 0 ? all[idx - 1] : null;
      if (prev && prev.lang && u.lang && prev.lang !== u.lang && prev.speaker !== u.speaker) mirrors++;
    }
    return { key: g.key, score, count: g.utterances.length, mirrorRate: mirrors / Math.max(1, g.utterances.length) };
  });
  const byScore = [...stats].sort((a, b) => b.score - a.score || b.count - a.count);
  roles[byScore[0].key] = "clinician";
  const rest = byScore.slice(1);
  let interpreter: string | null = null;
  if (rest.length >= 2) {
    const cand = [...rest].sort((a, b) => b.mirrorRate - a.mirrorRate)[0];
    if (cand.mirrorRate >= 0.5) interpreter = cand.key;
  }
  const patients = rest.filter((r) => r.key !== interpreter).sort((a, b) => b.count - a.count);
  if (patients[0]) roles[patients[0].key] = "patient";
  for (const r of rest) if (!roles[r.key]) roles[r.key] = "other";
  return roles;
}

function standardize(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return xs.map((x) => (x - mean) / sd);
}

export function clusterVoices(utterances: Utterance[]): Record<string, Speaker> | null {
  const voiced = utterances.filter((u) => !u.redacted && u.voice && u.voice.frames >= 3 && u.voice.pitch > 60 && u.voice.pitch < 400);
  if (voiced.length < 4) return null;
  const p = standardize(voiced.map((u) => Math.log(u.voice!.pitch)));
  const c = standardize(voiced.map((u) => u.voice!.centroid));
  const pts = voiced.map((_, i) => [p[i] * 1.5, c[i]]);
  const sorted = pts.map((x, i) => ({ x, i })).sort((a, b) => a.x[0] - b.x[0]);
  let cent = [sorted[0].x, sorted[sorted.length - 1].x];
  let assign: number[] = new Array(pts.length).fill(0);
  for (let iter = 0; iter < 25; iter++) {
    assign = pts.map((x) => {
      const d0 = (x[0] - cent[0][0]) ** 2 + (x[1] - cent[0][1]) ** 2;
      const d1 = (x[0] - cent[1][0]) ** 2 + (x[1] - cent[1][1]) ** 2;
      return d0 <= d1 ? 0 : 1;
    });
    const next = [0, 1].map((k) => {
      const m = pts.filter((_, i) => assign[i] === k);
      if (!m.length) return cent[k];
      return [m.reduce((s, v) => s + v[0], 0) / m.length, m.reduce((s, v) => s + v[1], 0) / m.length];
    });
    if (next.every((v, k) => v[0] === cent[k][0] && v[1] === cent[k][1])) break;
    cent = next;
  }
  const sizes = [0, 1].map((k) => assign.filter((a) => a === k).length);
  if (Math.min(...sizes) < 2) return null;
  const spread = pts.reduce((s, x, i) => s + (x[0] - cent[assign[i]][0]) ** 2 + (x[1] - cent[assign[i]][1]) ** 2, 0) / pts.length;
  const sep = (cent[0][0] - cent[1][0]) ** 2 + (cent[0][1] - cent[1][1]) ** 2;
  if (sep < spread * 2) return null;
  const rawMean = (k: number, f: (u: Utterance) => number) => {
    const xs = voiced.filter((_, i) => assign[i] === k).map(f);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const dPitch = Math.abs(rawMean(0, (u) => u.voice!.pitch) - rawMean(1, (u) => u.voice!.pitch));
  const dCent = Math.abs(rawMean(0, (u) => u.voice!.centroid) - rawMean(1, (u) => u.voice!.centroid));
  if (dPitch < 25 && dCent < 250) return null;
  const groups: SpeakerGroup[] = [0, 1].map((k) => ({ key: String(k), utterances: voiced.filter((_, i) => assign[i] === k) }));
  const roles = assignRoles(groups, utterances);
  const out: Record<string, Speaker> = {};
  voiced.forEach((u, i) => {
    out[u.id] = roles[String(assign[i])];
  });
  return out;
}
