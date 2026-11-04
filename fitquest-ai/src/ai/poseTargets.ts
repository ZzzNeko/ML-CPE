import { POSE_LANDMARK as L } from './landmarks.ts';
import type { Landmark } from './types';

/**
 * Pose library for the Pose Rhythm mode (Audition-style).
 *
 * Each pose is a *static* standing position the player must hit on the beat.
 * Matching is pure geometry on the smoothed landmarks (no sliding window), so
 * it reacts within a couple of frames — the 1D CNN needs ~30 frames of motion,
 * which is too slow to judge "be in this pose right now".
 *
 * Every score function returns 0–1 (1 = textbook pose). The game treats
 * `score >= POSE_MATCH_THRESHOLD` held for a few frames as a match.
 * All distances are in units of torso length (shoulder-mid → hip-mid), so the
 * result does not depend on how far the player stands from the camera.
 */

export type PoseId =
  | 'arms_up'
  | 'squat'
  | 'left_arm_up'
  | 'right_arm_up'
  | 'knee_left'
  | 'knee_right';

export const POSE_MATCH_THRESHOLD = 0.20;
/** A landmark below this visibility is treated as unseen (the pose scores 0). */
const MIN_VIS = 0.4;

type Pt = [number, number];
type Joint = 'ls' | 'rs' | 'le' | 're' | 'lw' | 'rw' | 'lh' | 'rh' | 'lk' | 'rk' | 'la' | 'ra';

/**
 * Stick-figure used to draw the target pose. x/y are roughly −1…1, y points
 * down. The figure is drawn as the player sees themselves (selfie view), so the
 * player's LEFT limbs are on the left of the icon.
 */
export interface PoseIcon {
  head: Pt;
  neck: Pt;
  joints: Record<Joint, Pt>;
}

export interface PoseTarget {
  id: PoseId;
  /** Thai label shown to the player. */
  label: string;
  /** Short English label (used in logs / docs). */
  labelEn: string;
  icon: PoseIcon;
  score: (lm: Landmark[], worldLandmarks?: Landmark[]) => number;
}

// ── geometry helpers ────────────────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0 at `lo`, 1 at `hi` (works for hi < lo too). */
const ramp = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo));
const vis = (p: Landmark | undefined) => p?.visibility ?? 0;
const seen = (...pts: (Landmark | undefined)[]) => pts.every((p) => p !== undefined && vis(p) >= MIN_VIS);

/** Interior angle at b in degrees (2D image space). */
function angle2D(a: Landmark, b: Landmark, c: Landmark): number {
  const ux = a.x - b.x, uy = a.y - b.y;
  const vx = c.x - b.x, vy = c.y - b.y;
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (den < 1e-9) return 180;
  return (Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / den))) * 180) / Math.PI;
}

function angle3D(a: Landmark, b: Landmark, c: Landmark): number {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const den = Math.hypot(...u) * Math.hypot(...v);
  if (den < 1e-9) return 180;
  return (Math.acos(Math.min(1, Math.max(-1, dot / den))) * 180) / Math.PI;
}

function jointAngle(lm: Landmark[], world: Landmark[] | undefined, a: number, b: number, c: number): number | null {
  const points = [lm[a], lm[b], lm[c]];
  if (!points.every((point) => point && vis(point) >= MIN_VIS)) return null;
  const screenAngle = angle2D(points[0], points[1], points[2]);
  const worldPoints = world ? [world[a], world[b], world[c]] : [];
  if (worldPoints.length && worldPoints.every((point) => point && vis(point) >= MIN_VIS)) {
    // Prefer 3D geometry when available; the 2D projection can make a straight limb look bent.
    return angle3D(worldPoints[0], worldPoints[1], worldPoints[2]);
  }
  return screenAngle;
}

const extension = (angle: number | null) => angle === null ? 0 : ramp(angle, 110, 170);
const flexion = (angle: number | null) => angle === null ? 0 : 1 - ramp(angle, 95, 165);

interface Torso {
  T: number;
  cx: number;
}

function torso(lm: Landmark[]): Torso | null {
  const ls = lm[L.LEFT_SHOULDER], rs = lm[L.RIGHT_SHOULDER], lh = lm[L.LEFT_HIP], rh = lm[L.RIGHT_HIP];
  if (!seen(ls, rs, lh, rh)) return null;
  const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
  const hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2;
  const T = Math.hypot(sx - hx, sy - hy);
  if (T < 0.04) return null;
  return { T, cx: (sx + hx) / 2 };
}

// ── per-pose scoring ────────────────────────────────────────

/** How far a wrist is above its shoulder, 0 (level) → 1 (fully overhead). */
function armRaised(lm: Landmark[], side: 'l' | 'r', T: number): number {
  const s = lm[side === 'l' ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER];
  const w = lm[side === 'l' ? L.LEFT_WRIST : L.RIGHT_WRIST];
  if (!seen(s, w)) return 0;
  return ramp(s.y - w.y, 0.05 * T, 0.45 * T);
}

/** Wrist clearly below shoulder = arm down (1) vs level/raised (0). */
function armLowered(lm: Landmark[], side: 'l' | 'r', T: number): number {
  const s = lm[side === 'l' ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER];
  const w = lm[side === 'l' ? L.LEFT_WRIST : L.RIGHT_WRIST];
  if (!seen(s, w)) return 0;
  return ramp(w.y - s.y, 0, 0.5 * T);
}

/** Thigh drop for one leg: knee-below-hip distance in torso units (≈0.9–1.0 standing). */
function thigh(lm: Landmark[], side: 'l' | 'r', T: number): number | null {
  const h = lm[side === 'l' ? L.LEFT_HIP : L.RIGHT_HIP];
  const k = lm[side === 'l' ? L.LEFT_KNEE : L.RIGHT_KNEE];
  if (!seen(h, k)) return null;
  return (k.y - h.y) / T;
}

function armsUp(lm: Landmark[], world?: Landmark[]): number {
  const t = torso(lm);
  if (!t) return 0;
  const leftElbow = extension(jointAngle(lm, world, L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST));
  const rightElbow = extension(jointAngle(lm, world, L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST));
  return Math.min(armRaised(lm, 'l', t.T), armRaised(lm, 'r', t.T), leftElbow, rightElbow);
}

function oneArmUp(lm: Landmark[], up: 'l' | 'r', world?: Landmark[]): number {
  const t = torso(lm);
  if (!t) return 0;
  const down = up === 'l' ? 'r' : 'l';
  const upSide = up === 'l' ? 'l' : 'r';
  const downSide = down === 'l' ? 'l' : 'r';
  const elbowIndex = (side: 'l' | 'r') => side === 'l'
    ? [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST] as const
    : [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST] as const;
  const [us, ue, uw] = elbowIndex(upSide);
  const [ds, de, dw] = elbowIndex(downSide);
  return Math.min(
    armRaised(lm, up, t.T),
    armLowered(lm, down, t.T),
    extension(jointAngle(lm, world, us, ue, uw)),
    extension(jointAngle(lm, world, ds, de, dw)),
  );
}

function squat(lm: Landmark[], world?: Landmark[]): number {
  const t = torso(lm);
  if (!t) return 0;
  const l = thigh(lm, 'l', t.T), r = thigh(lm, 'r', t.T);
  if (l === null || r === null) return 0;
  const leftKneeAngle = jointAngle(lm, world, L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE);
  const rightKneeAngle = jointAngle(lm, world, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE);
  if (leftKneeAngle === null || rightKneeAngle === null) return 0;
  const kneeBend = Math.min(
    flexion(leftKneeAngle),
    flexion(rightKneeAngle),
  );
  const balancedKnees = 1 - ramp(Math.abs(leftKneeAngle - rightKneeAngle), 25, 70);
  const balancedLegPosition = 1 - ramp(Math.abs(l - r), 0.4, 0.9);
  return Math.min(kneeBend, balancedKnees, balancedLegPosition);
}

function kneeRaise(lm: Landmark[], up: 'l' | 'r', world?: Landmark[]): number {
  const t = torso(lm);
  if (!t) return 0;
  const a = thigh(lm, up, t.T), b = thigh(lm, up === 'l' ? 'r' : 'l', t.T);
  if (a === null || b === null) return 0;
  // Raised knee near hip height, other leg still planted.
  const upIndices = up === 'l'
    ? [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE] as const
    : [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE] as const;
  const downIndices = up === 'l'
    ? [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE] as const
    : [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE] as const;
  const raisedKneeAngle = jointAngle(lm, world, upIndices[0], upIndices[1], upIndices[2]);
  const plantedKneeAngle = jointAngle(lm, world, downIndices[0], downIndices[1], downIndices[2]);
  return Math.min(
    1 - ramp(a, 0.25, 0.7),
    ramp(b, 0.6, 0.85),
    flexion(raisedKneeAngle),
    1 - flexion(plantedKneeAngle),
  );
}

// ── icons ───────────────────────────────────────────────────

const BASE: PoseIcon = {
  head: [0, -0.8],
  neck: [0, -0.6],
  joints: {
    ls: [-0.2, -0.55], rs: [0.2, -0.55],
    le: [-0.3, -0.2], re: [0.3, -0.2],
    lw: [-0.33, 0.12], rw: [0.33, 0.12],
    lh: [-0.13, -0.05], rh: [0.13, -0.05],
    lk: [-0.15, 0.4], rk: [0.15, 0.4],
    la: [-0.16, 0.85], ra: [0.16, 0.85],
  },
};

const icon = (over: Partial<Record<Joint, Pt>>, head?: Pt, neck?: Pt): PoseIcon => ({
  head: head ?? BASE.head,
  neck: neck ?? BASE.neck,
  joints: { ...BASE.joints, ...over },
});

const LEFT_UP: Partial<Record<Joint, Pt>> = { le: [-0.32, -0.85], lw: [-0.36, -1.15] };
const RIGHT_UP: Partial<Record<Joint, Pt>> = { re: [0.32, -0.85], rw: [0.36, -1.15] };

// ── the library ─────────────────────────────────────────────

export const POSE_TARGETS: Record<PoseId, PoseTarget> = {
  arms_up: {
    id: 'arms_up', label: 'ยกแขนสองข้าง', labelEn: 'Arms up',
    icon: icon({ ...LEFT_UP, ...RIGHT_UP }),
    score: armsUp,
  },
  squat: {
    id: 'squat', label: 'ย่อเข่า (สควอช)', labelEn: 'Squat',
    icon: icon(
      {
        ls: [-0.2, -0.2], rs: [0.2, -0.2],
        le: [-0.3, -0.05], re: [0.3, -0.05], lw: [-0.1, -0.15], rw: [0.1, -0.15],
        lh: [-0.13, 0.25], rh: [0.13, 0.25],
        lk: [-0.4, 0.45], rk: [0.4, 0.45],
        la: [-0.3, 0.88], ra: [0.3, 0.88],
      },
      [0, -0.45],
      [0, -0.25],
    ),
    score: squat,
  },
  left_arm_up: {
    id: 'left_arm_up', label: 'ยกแขนซ้าย', labelEn: 'Left arm up',
    icon: icon(LEFT_UP),
    score: (lm, world) => oneArmUp(lm, 'l', world),
  },
  right_arm_up: {
    id: 'right_arm_up', label: 'ยกแขนขวา', labelEn: 'Right arm up',
    icon: icon(RIGHT_UP),
    score: (lm, world) => oneArmUp(lm, 'r', world),
  },
  knee_left: {
    id: 'knee_left', label: 'ยกเข่าซ้าย', labelEn: 'Left knee up',
    icon: icon({ lk: [-0.35, 0.0], la: [-0.3, 0.45] }),
    score: (lm, world) => kneeRaise(lm, 'l', world),
  },
  knee_right: {
    id: 'knee_right', label: 'ยกเข่าขวา', labelEn: 'Right knee up',
    icon: icon({ rk: [0.35, 0.0], ra: [0.3, 0.45] }),
    score: (lm, world) => kneeRaise(lm, 'r', world),
  },
};

export const POSE_IDS = Object.keys(POSE_TARGETS) as PoseId[];

/** Score every pose for one frame. */
export function scoreAllPoses(lm: Landmark[], worldLandmarks?: Landmark[]): Record<PoseId, number> {
  const out = {} as Record<PoseId, number>;
  for (const id of POSE_IDS) out[id] = lm.length >= 33 ? POSE_TARGETS[id].score(lm, worldLandmarks) : 0;
  return out;
}

// ── motion move: jumping jack ───────────────────────────────

/**
 * Jumping jack is a *motion*, not a static pose: it is judged over a stretch of
 * time (see JumpingJackTracker), so it has no `score` function. This geometry
 * only says whether the body is in the "open" or "closed" half of one jack.
 */
export type MotionId = 'jumping_jack';
/** Anything a note can ask for: a static pose or a motion move. */
export type NoteTarget = PoseId | MotionId;

export interface JackPhase {
  /** Arms overhead and feet wide. */
  open: number;
  /** Arms down and feet together. */
  closed: number;
  /** Both arms raised, 0–1 (the same measure as the Arms up pose). */
  up: number;
}

export function jackPhase(lm: Landmark[]): JackPhase {
  const none = { open: 0, closed: 0, up: 0 };
  if (lm.length < 33) return none;
  const t = torso(lm);
  const la = lm[L.LEFT_ANKLE], ra = lm[L.RIGHT_ANKLE];
  if (!t || !seen(la, ra)) return none;
  const spread = Math.abs(la.x - ra.x) / t.T;
  const up = Math.min(armRaised(lm, 'l', t.T), armRaised(lm, 'r', t.T));
  const down = Math.min(armLowered(lm, 'l', t.T), armLowered(lm, 'r', t.T));
  return {
    open: Math.min(up, ramp(spread, 0.9, 1.4)),
    closed: Math.min(down, 1 - ramp(spread, 0.7, 1.0)),
    up,
  };
}

export const JUMPING_JACK = {
  id: 'jumping_jack' as MotionId,
  label: 'กระโดดตบ',
  labelEn: 'Jumping jacks',
  /** Two frames, so the target card can animate open ↔ closed on the beat. */
  open: icon({
    ...LEFT_UP,
    ...RIGHT_UP,
    lk: [-0.32, 0.4], rk: [0.32, 0.4],
    la: [-0.52, 0.85], ra: [0.52, 0.85],
  }),
  closed: icon({}),
};

export function isMotion(t: NoteTarget): t is MotionId {
  return t === 'jumping_jack';
}

export function noteLabel(t: NoteTarget): string {
  return isMotion(t) ? JUMPING_JACK.label : POSE_TARGETS[t].label;
}

/** Stick figure for any note target; `frame` flips a motion between its two halves. */
export function noteIcon(t: NoteTarget, frame: 0 | 1 = 0): PoseIcon {
  if (!isMotion(t)) return POSE_TARGETS[t].icon;
  return frame === 0 ? JUMPING_JACK.open : JUMPING_JACK.closed;
}
