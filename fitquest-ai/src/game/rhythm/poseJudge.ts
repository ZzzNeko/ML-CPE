import type { NoteTarget } from '../../ai/poseTargets';
import type { NoteKind, PoseNote } from './poseBeatmap';
import type { HitGrade } from './RhythmAudio';

/**
 * Pure rules for Pose Rhythm: timing windows, grades, scoring, the fever meter
 * and per-pose stats. No Phaser, no DOM, so it can be unit-tested.
 */

/**
 * Timing windows in seconds around the beat. Whole-body poses are slower and
 * noisier than a fingertip, so they are wider than the touch-rhythm windows.
 */
export const WINDOW = { perfect: 0.3, great: 0.6, good: 0.9 } as const;
/** Kept for compatibility with older tests/config consumers; Pose Rhythm no longer shrinks windows. */
export const MIN_WINDOW_SCALE = 1;

export interface Windows {
  perfect: number;
  great: number;
  good: number;
}

/**
 * Pose Rhythm keeps the same forgiving timing bands even for dense chains.
 * Notes are judged sequentially, so overlapping windows cannot double-score.
 */
export function windowsForGap(_gapSec: number): Windows {
  return { ...WINDOW };
}

const noteEnd = (n: Pick<PoseNote, 'time' | 'duration'>) => n.time + n.duration;

/** Distance from note `i` to the nearest neighbouring note (end of prev → start, start → next start). */
export function neighbourGap(notes: Pick<PoseNote, 'time' | 'duration'>[], i: number): number {
  const n = notes[i];
  const prev = notes[i - 1];
  const next = notes[i + 1];
  const before = prev ? n.time - noteEnd(prev) : Infinity;
  const after = next ? next.time - n.time : Infinity;
  return Math.min(before, after);
}

export const RANK: Record<HitGrade, number> = { miss: 0, good: 1, great: 2, perfect: 3 };
export const POINTS: Record<HitGrade, number> = { perfect: 300, great: 150, good: 50, miss: 0 };
export const WEIGHT: Record<HitGrade, number> = { perfect: 1, great: 0.66, good: 0.33, miss: 0 };
/** Holds and motion moves ask more of the player, so they pay more. */
export const NOTE_VALUE: Record<NoteKind, number> = { pose: 1, hold: 1.5, motion: 2 };

export function nextMatchStreak(score: number, threshold: number, streak: number): number {
  return Number.isFinite(score) && score >= threshold ? streak + 1 : 0;
}

/** Combines geometry and CNN in hybrid mode, or requires CNN in experiment mode. */
export function isPoseMatch(
  geometryScore: number,
  geometryThreshold: number,
  cnnProbability: number | undefined,
  cnnThreshold: number,
  cnnOnly = false,
): boolean {
  const cnnMatch = cnnProbability !== undefined
    && Number.isFinite(cnnProbability)
    && cnnProbability >= cnnThreshold;
  if (cnnOnly) return cnnMatch;
  const geometryMatch = Number.isFinite(geometryScore) && geometryScore >= geometryThreshold;
  return geometryMatch || cnnMatch;
}

export function gradeAt(dt: number, w: Windows): HitGrade {
  const d = Math.abs(dt);
  return d <= w.perfect ? 'perfect' : d <= w.great ? 'great' : d <= w.good ? 'good' : 'miss';
}

/** Completion-based judgement: timing can lower the grade, but a late pose never expires into MISS. */
export function completionGrade(deltaSec: number, w: Windows): HitGrade {
  // Preserve the sign: completing before the scheduled beat is valid timing too.
  // Once the GOOD window has passed, completion remains forgiving and is still GOOD.
  const grade = gradeAt(deltaSec, w);
  return grade === 'miss' ? 'good' : grade;
}

/**
 * Early recognition is a preparation signal, not an immediate judgement.
 * Plain poses collect the best match around the beat and are judged at the
 * late edge, so feedback follows the rhythm rather than firing as soon as the
 * pose becomes correct. Holds start at the beat to preserve their sustain
 * window. A perfect detected before the beat is remembered, but not committed
 * before the scheduled beat window.
 */
export function shouldFinalizePose(
  deltaSec: number,
  lateWindowSec: number,
  isHold: boolean,
): boolean {
  if (deltaSec < 0) return false;
  if (isHold) return true;
  return deltaSec >= lateWindowSec;
}

/**
 * Acquisition is intentionally wider than the scoring windows: whole-body pose
 * recognition has latency, and players should be able to prepare before a beat.
 * Chain notes get a shorter lead-in to keep fast transitions readable.
 */
export function poseAcquisitionWindows(
  beatSec: number,
  windows: Windows,
  isChain: boolean,
): { early: number; late: number } {
  // Give whole-body tracking more lead-in to account for camera + landmark latency.
  // Chains stay shorter, but are still forgiving enough for a real transition.
  const earlyBeats = isChain ? 1.0 : 1.6;
  const lateBeats = isChain ? 0.9 : 1.0;
  return {
    early: Math.max(windows.good, beatSec * earlyBeats),
    late: Math.max(windows.good, beatSec * lateBeats),
  };
}

/** A hold keeps its timing grade only if the pose was kept for most of the hold. */
export function holdGrade(timing: HitGrade, ratio: number): HitGrade {
  // Pose Rhythm has no MISS state: even a short hold earns at least GOOD.
  if (timing === 'miss') return 'good';
  const cap: HitGrade = ratio >= 0.85 ? 'perfect' : ratio >= 0.6 ? 'great' : 'good';
  return RANK[cap] < RANK[timing] ? cap : timing;
}

/**
 * A motion move is graded by how much of its span the player was moving.
 * Generous, because the CNN lags the player by about a second.
 */
export function motionGrade(ratio: number): HitGrade {
  // Motion completion is optional and forgiving; it never produces MISS.
  return ratio >= 0.6 ? 'perfect' : ratio >= 0.4 ? 'great' : 'good';
}

export const COMBO_CAP = 100;
export const FEVER_BONUS = 1;

/** Score multiplier: +1% per combo (capped at ×2) and +1 while Fever is on. */
export function multiplier(combo: number, fever: boolean): number {
  return 1 + Math.min(combo, COMBO_CAP) / COMBO_CAP + (fever ? FEVER_BONUS : 0);
}

export function notePoints(grade: HitGrade, kind: NoteKind, combo: number, fever: boolean): number {
  return Math.round(POINTS[grade] * NOTE_VALUE[kind] * multiplier(combo, fever));
}

export function perfectChallengeBonus(grade: HitGrade): number {
  return grade === 'perfect' ? 150 : 0;
}

/** Bonus for finishing a chain with no miss; doubled if every pose was perfect. */
export function chainBonus(length: number, allPerfect: boolean, combo: number, fever: boolean): number {
  return Math.round(100 * length * (allPerfect ? 2 : 1) * multiplier(combo, fever));
}

// ── chains ────────────────────────────────────────────────────

export interface ChainOutcome {
  length: number;
  broken: boolean;
  allPerfect: boolean;
}

/**
 * Collects the grades of a chain's notes as they are judged (not necessarily in
 * order) and reports once the last one lands.
 */
export class ChainTracker {
  private chains = new Map<number, { done: number; broken: boolean; allPerfect: boolean }>();

  reset() {
    this.chains.clear();
  }

  /** Returns the outcome when this grade completes its chain, else null. */
  add(note: Pick<PoseNote, 'chainId' | 'chainLength'>, grade: HitGrade): ChainOutcome | null {
    if (note.chainId < 0) return null;
    const c = this.chains.get(note.chainId) ?? { done: 0, broken: false, allPerfect: true };
    c.done += 1;
    if (grade === 'miss') c.broken = true;
    if (grade !== 'perfect') c.allPerfect = false;
    this.chains.set(note.chainId, c);
    if (c.done < note.chainLength) return null;
    this.chains.delete(note.chainId);
    return { length: note.chainLength, broken: c.broken, allPerfect: c.allPerfect };
  }
}

// ── fever ─────────────────────────────────────────────────────

export const FEVER = {
  /** Meter gained per grade (full = 1). Perfects fill it; a miss drains it. */
  gain: { perfect: 0.08, great: 0.03, good: 0, miss: -0.25 } as Record<HitGrade, number>,
  /** Fever lasts this many beats. */
  beats: 16,
} as const;

/**
 * Fever meter. Perfects fill it; at 100% Fever starts for a fixed number of
 * beats (higher score multiplier), then the meter starts again from empty.
 */
export class FeverMeter {
  private level = 0;
  private until = -Infinity;
  private length = 1;
  /** Number of times Fever has started this song. */
  starts = 0;

  reset() {
    this.level = 0;
    this.until = -Infinity;
    this.starts = 0;
  }

  active(t: number): boolean {
    return t < this.until;
  }

  /** Meter fill while charging, time left (1 → 0) while Fever is on. */
  progress(t: number): number {
    return this.active(t) ? (this.until - t) / this.length : this.level;
  }

  /** Apply a judged grade. Returns true on the note that starts Fever. */
  add(grade: HitGrade, t: number, beatSec: number): boolean {
    if (this.active(t)) return false;
    this.level = Math.min(1, Math.max(0, this.level + FEVER.gain[grade]));
    if (this.level < 1) return false;
    this.level = 0;
    this.length = FEVER.beats * beatSec;
    this.until = t + this.length;
    this.starts += 1;
    return true;
  }
}

// ── per-pose stats ────────────────────────────────────────────

export interface TargetStat {
  target: NoteTarget;
  total: number;
  weightSum: number;
  counts: Record<HitGrade, number>;
}

/** Accuracy per pose / move, for the result screen. */
export class TargetStats {
  private stats = new Map<NoteTarget, TargetStat>();

  reset() {
    this.stats.clear();
  }

  add(target: NoteTarget, grade: HitGrade) {
    const s = this.stats.get(target) ?? {
      target, total: 0, weightSum: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 },
    };
    s.total += 1;
    s.weightSum += WEIGHT[grade];
    s.counts[grade] += 1;
    this.stats.set(target, s);
  }

  /** Weakest first, so the result screen can point at what to practise. */
  list(): (TargetStat & { accuracy: number })[] {
    return [...this.stats.values()]
      .map((s) => ({ ...s, accuracy: Math.round((s.weightSum / s.total) * 100) }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
  }
}
