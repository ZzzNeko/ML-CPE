export type Difficulty = 'easy' | 'normal' | 'hard';

export interface RhythmLevel {
  bpm: number;
  /** Seconds a circle is visible before it must be hit. */
  approach: number;
  /** Circle radius in game pixels. */
  radius: number;
  /** Chance a downbeat is skipped (never twice in a row). */
  skipProb: number;
  /** Chance an extra circle lands on the off-beat. */
  offbeatProb: number;
}

export const RHYTHM_LEVELS: Record<Difficulty, RhythmLevel> = {
  easy: { bpm: 88, approach: 1.5, radius: 72, skipProb: 0.25, offbeatProb: 0 },
  normal: { bpm: 104, approach: 1.2, radius: 62, skipProb: 0, offbeatProb: 0.18 },
  hard: { bpm: 124, approach: 1.0, radius: 54, skipProb: 0, offbeatProb: 0.38 },
};

export interface Note {
  id: number;
  /** Seconds from song start (song time 0 = first beat after the count-in). */
  time: number;
  x: number;
  y: number;
  /** Number printed inside the circle (1–8, cycles). */
  num: number;
}

export interface Beatmap {
  notes: Note[];
  /** Song time when the session ends. */
  endTime: number;
}

/** The count-in is this many beats long, played before song time 0. */
export const LEAD_BEATS = 4;
const FIRST_NOTE_BEAT = 4;
/** Comfortable arm travel speed, game px per second — caps how far apart close notes land. */
const HAND_SPEED = 520;

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Procedurally places circles on the beat. Spacing between consecutive circles
 * scales with the time gap, so quick pairs stay close together and are
 * physically reachable with a hand.
 */
export function buildBeatmap(
  level: RhythmLevel,
  durationSec: number,
  field: { width: number; height: number },
  seed = 7,
): Beatmap {
  const rand = rng(seed);
  const beat = 60 / level.bpm;
  const totalBeats = Math.floor(durationSec / beat);

  const times: number[] = [];
  let skippedLast: boolean = false;
  for (let b = FIRST_NOTE_BEAT; b < totalBeats - 1; b++) {
    const skip: boolean = !skippedLast && rand() < level.skipProb;
    skippedLast = skip;
    if (skip) continue;
    times.push(b * beat);
    if (rand() < level.offbeatProb) times.push((b + 0.5) * beat);
  }

  const r = level.radius;
  const minX = r + 40;
  const maxX = field.width - r - 40;
  const minY = r + 80; // leave room for the HUD
  const maxY = field.height - r - 40;

  const notes: Note[] = [];
  let px = field.width / 2;
  let py = field.height / 2;
  let prevTime = (times[0] ?? 1) - 1;

  times.forEach((time, i) => {
    const gap = time - prevTime;
    const want = clamp(gap * HAND_SPEED * (0.6 + 0.4 * rand()), r * 2.4, 340);
    let x = px;
    let y = py;
    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      const angle = rand() * Math.PI * 2;
      x = px + Math.cos(angle) * want;
      y = py + Math.sin(angle) * want;
      placed = x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    if (!placed) {
      x = clamp(x, minX, maxX);
      y = clamp(y, minY, maxY);
      if (Math.hypot(x - px, y - py) < r * 2.1) x = clamp(px + (px < field.width / 2 ? 1 : -1) * r * 2.4, minX, maxX);
    }
    notes.push({ id: i, time, x: Math.round(x), y: Math.round(y), num: (i % 8) + 1 });
    px = x;
    py = y;
    prevTime = time;
  });

  const last = times[times.length - 1] ?? 0;
  return { notes, endTime: last + 2 };
}
