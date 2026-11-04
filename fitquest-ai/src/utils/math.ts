import type { Landmark } from '../ai/types';

export interface Point2D {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Interior angle at `vertex` in degrees (0–180) — elbow, knee and shoulder
 * angles for the Phase 5 feature vector.
 */
export function angleAt(vertex: Point2D, a: Point2D, b: Point2D): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  const cos = clamp((v1.x * v2.x + v1.y * v2.y) / mag, -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

export function meanVisibility(landmarks: Landmark[], indices: number[]): number {
  if (indices.length === 0) return 0;
  const total = indices.reduce((sum, i) => sum + (landmarks[i]?.visibility ?? 0), 0);
  return total / indices.length;
}
