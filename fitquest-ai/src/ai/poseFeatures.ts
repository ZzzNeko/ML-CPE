import type { Landmark } from './types';

// Port of ml/scripts/features.py::extract_features — must stay numerically identical.
// Image-space depth is dropped because it changes with camera framing.
const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14, L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24, L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;

const JOINTS: [number, number, number][] = [
  [L_SHOULDER, L_ELBOW, L_WRIST], [R_SHOULDER, R_ELBOW, R_WRIST],
  [L_HIP, L_KNEE, L_ANKLE], [R_HIP, R_KNEE, R_ANKLE],
  [L_ELBOW, L_SHOULDER, L_HIP], [R_ELBOW, R_SHOULDER, R_HIP],
  [L_SHOULDER, L_HIP, L_KNEE], [R_SHOULDER, R_HIP, R_KNEE],
];
const COORD_IDX = [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE];
const RATIO_PAIRS: [number, number][] = [
  [L_WRIST, R_WRIST], [L_ANKLE, R_ANKLE], [L_WRIST, L_HIP], [R_WRIST, R_HIP],
  [L_KNEE, L_HIP], [R_KNEE, R_HIP], [L_ANKLE, L_HIP], [R_ANKLE, R_HIP],
];

export const FEATURE_COUNT = 52;
type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);

function angle(a: V3, b: V3, c: V3): number {
  const u = sub(a, b), v = sub(c, b);
  const den = norm(u) * norm(v);
  if (den < 1e-8) return 0;
  const cos = Math.min(1, Math.max(-1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / den));
  return Math.acos(cos) / Math.PI;
}

export function extractFeatures(points: Pick<Landmark, 'x' | 'y' | 'z'>[]): Float32Array {
  if (points.length !== 33) throw new Error(`Expected 33 landmarks, got ${points.length}`);
  const xyz: V3[] = points.map((p) => [p.x, p.y, 0]);
  const center: V3 = [0, 1, 2].map((i) => (xyz[L_HIP][i] + xyz[R_HIP][i]) / 2) as V3;
  const shoulderMid: V3 = [0, 1, 2].map((i) => (xyz[L_SHOULDER][i] + xyz[R_SHOULDER][i]) / 2) as V3;
  const scale = Math.max(norm(sub(xyz[L_SHOULDER], xyz[R_SHOULDER])), norm(sub(shoulderMid, center)), 1e-4);
  const n: V3[] = xyz.map((p) => [(p[0] - center[0]) / scale, (p[1] - center[1]) / scale, (p[2] - center[2]) / scale]);

  const out = new Float32Array(FEATURE_COUNT);
  let k = 0;
  for (const i of COORD_IDX) for (let a = 0; a < 3; a++) out[k++] = n[i][a];
  for (const [a, b, c] of JOINTS) out[k++] = angle(xyz[a], xyz[b], xyz[c]);
  for (const [i, j] of RATIO_PAIRS) out[k++] = norm(sub(n[i], n[j]));
  return out;
}
