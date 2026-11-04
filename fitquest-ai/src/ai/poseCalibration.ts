import { POSE_MATCH_THRESHOLD, type PoseId } from './poseTargets.ts';

/**
 * Per-pose calibration for Pose Rhythm.
 *
 * Bodies and cameras differ: someone with a stiff shoulder may never reach a
 * textbook "arms up" (score 1.0) but can hold 0.8 all day. During calibration
 * the player holds each pose and we record the best score they can *sustain*
 * (its "peak"). The game then asks for 65% of that peak within safe bounds. A
 * pose the player cannot reach at all is skipped, and the beatmap stops asking
 * for it.
 */

const KEY = 'fitquest-pose-calibration';

export const CALIBRATION = {
  /** A sustained peak below this means the pose is not reachable: skip it. */
  minPeak: 0.5,
  /** Fraction of the personal peak that counts as "in the pose". */
  factor: 0.65,
  /** Never ask for less than this (below it, standing around would match). */
  floor: 0.2,
  /** Bound the personal threshold so calibration cannot make scoring trivial or impossible. */
  ceil: 0.65,
} as const;

const POSE_THRESHOLD_CEILINGS: Partial<Record<PoseId, number>> = {
  // Squat scores are bounded by several geometry checks, so a normal valid
  // squat may never reach the general ceiling even when performed correctly.
  squat: 0.35,
};

export interface PoseCalibration {
  /** Personal match threshold per calibrated pose. */
  thresholds: Partial<Record<PoseId, number>>;
  /** Poses the player cannot do; left out of the beatmap. */
  skipped: PoseId[];
  updatedAt: number;
}

export function emptyCalibration(): PoseCalibration {
  return { thresholds: {}, skipped: [], updatedAt: 0 };
}

/** Threshold for a sustained peak, or null when the pose is out of reach. */
export function thresholdFromPeak(peak: number): number | null {
  if (!(peak >= CALIBRATION.minPeak)) return null;
  return Math.min(CALIBRATION.ceil, Math.max(CALIBRATION.floor, peak * CALIBRATION.factor));
}

export function thresholdFor(id: PoseId, cal: PoseCalibration | null): number {
  const personal = cal?.thresholds[id];
  if (personal === undefined || !Number.isFinite(personal)) return POSE_MATCH_THRESHOLD;
  const ceiling = POSE_THRESHOLD_CEILINGS[id] ?? CALIBRATION.ceil;
  return Math.min(ceiling, Math.max(CALIBRATION.floor, personal));
}

/**
 * Drop skipped poses from a pool. If that would leave fewer than `minPoses`
 * (a beatmap needs variety, since a pose never repeats back to back), the
 * skips are ignored instead.
 */
export function applySkips(pool: PoseId[], cal: PoseCalibration | null, minPoses = 3): PoseId[] {
  if (!cal || cal.skipped.length === 0) return pool;
  const kept = pool.filter((p) => !cal.skipped.includes(p));
  return kept.length >= minPoses ? kept : pool;
}

/** Merge new results into an existing calibration (newest wins per pose). */
export function mergeCalibration(
  base: PoseCalibration | null,
  results: Partial<Record<PoseId, number | null>>,
): PoseCalibration {
  const out: PoseCalibration = {
    thresholds: { ...(base?.thresholds ?? {}) },
    skipped: [...(base?.skipped ?? [])],
    updatedAt: Date.now(),
  };
  for (const [key, value] of Object.entries(results) as [PoseId, number | null | undefined][]) {
    if (value === undefined) continue;
    out.skipped = out.skipped.filter((p) => p !== key);
    delete out.thresholds[key];
    if (value === null) out.skipped.push(key);
    else out.thresholds[key] = value;
  }
  return out;
}

export function loadPoseCalibration(): PoseCalibration | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PoseCalibration>;
    const thresholds: PoseCalibration['thresholds'] = {};
    for (const [k, v] of Object.entries(parsed.thresholds ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= CALIBRATION.floor && v <= CALIBRATION.ceil) thresholds[k as PoseId] = v;
    }
    const skipped = Array.isArray(parsed.skipped) ? (parsed.skipped.filter((s) => typeof s === 'string') as PoseId[]) : [];
    return { thresholds, skipped, updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0 };
  } catch {
    return null;
  }
}

export function savePoseCalibration(cal: PoseCalibration) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cal));
  } catch {
    /* private mode / quota: calibration just won't persist */
  }
}

export function clearPoseCalibration() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** How many poses carry a personal setting (calibrated or skipped). */
export function calibratedCount(cal: PoseCalibration | null): number {
  return cal ? Object.keys(cal.thresholds).length + cal.skipped.length : 0;
}
