import type { NoteTarget, PoseId } from '../../ai/poseTargets';
import type { Difficulty } from './beatmap';
import { timelineBeatPositions, type BeatAnalysis } from './youtubeBeatDetection.ts';

export interface PoseLevel {
  bpm: number;
  /** Beats between one note and the next (after a chain/hold, see the builder). */
  beatsPerPose: number;
  /** Poses this difficulty may ask for. */
  pool: PoseId[];
  /** Song length in seconds. */
  seconds: number;
  /** Chance a note starts a chain: 2..maxChain poses on consecutive beats. */
  chainChance: number;
  maxChain: number;
  /** Chance of a hold pose, and how many beats it must be held. */
  holdChance: number;
  holdBeats: number;
  /** Chance of a motion move (jumping jacks), and how many beats it lasts. */
  motionChance: number;
  motionBeats: number;
}

const EASY_POOL: PoseId[] = ['arms_up', 'left_arm_up', 'right_arm_up'];

export const POSE_LEVELS: Record<Difficulty, PoseLevel> = {
  easy: {
    bpm: 84, beatsPerPose: 2, pool: EASY_POOL, seconds: 90,
    chainChance: 0.15, maxChain: 2,
    holdChance: 0.15, holdBeats: 2,
    motionChance: 0, motionBeats: 0,
  },
  normal: {
    bpm: 100, beatsPerPose: 2, pool: [...EASY_POOL, 'squat'], seconds: 120,
    chainChance: 0.22, maxChain: 3,
    holdChance: 0.15, holdBeats: 2,
    motionChance: 0.08, motionBeats: 5,
  },
  hard: {
    bpm: 120, beatsPerPose: 2, pool: [...EASY_POOL, 'squat', 'knee_left', 'knee_right'], seconds: 150,
    chainChance: 0.28, maxChain: 4,
    holdChance: 0.15, holdBeats: 3,
    motionChance: 0.1, motionBeats: 6,
  },
};


export type NoteKind = 'pose' | 'hold' | 'motion';

export interface PoseNote {
  id: number;
  /** Seconds from song start (song time 0 = first beat after the count-in). */
  time: number;
  pose: NoteTarget;
  kind: NoteKind;
  /** Seconds the pose must be held / the move performed. 0 for a plain pose. */
  duration: number;
  /** Notes of one chain share an id; -1 when the note is not part of a chain. */
  chainId: number;
  chainIndex: number;
  chainLength: number;
  cueTime?: number;
  beatSeconds?: number;
  beatIndex?: number;
  confidence?: number;
  challenge?: 'perfect';
}

export interface PoseBeatmap {
  notes: PoseNote[];
  endTime: number;
}

export type SongSection = 'intro' | 'build' | 'chorus' | 'break' | 'final';

/** A deterministic song-relative intensity arc; it does not claim to analyze audio structure. */
export function songSection(progress: number): SongSection {
  if (progress < 0.15) return 'intro';
  if (progress < 0.3) return 'build';
  if (progress < 0.6) return 'chorus';
  if (progress < 0.72) return 'break';
  return 'final';
}

export const noteEnd = (n: Pick<PoseNote, 'time' | 'duration'>) => n.time + n.duration;

/** Let the track establish its groove before asking for the first pose. */
export const FIRST_NOTE_BEAT = 4;
/** Show a pose one beat before its target, not immediately at song start. */
export const POSE_CUE_BEATS = 1;
/** The opening pose is shown at song start while the intro measure plays. */
export function shouldShowPoseCue(noteId: number, secondsUntil: number, beatSeconds: number): boolean {
  return noteId === 0 || secondsUntil <= beatSeconds * POSE_CUE_BEATS;
}
export function shouldAdvancePoseCue(currentTime: number, nextTime: number, songTime: number, beatSeconds: number): boolean {
  return songTime >= currentTime && nextTime - songTime <= beatSeconds * POSE_CUE_BEATS;
}

export function selectVisiblePoseCue<T extends Pick<PoseNote, 'id'>>(
  notes: T[],
  isDone: (note: T) => boolean,
): T | null {
  for (const note of notes) {
    if (!isDone(note)) return note;
  }
  return null;
}
/** No motion move until the player has warmed up with this many notes. */
const WARMUP_NOTES = 4;
/** Knee raises are not held: they are a transition, not a stance. */
const NO_HOLD: PoseId[] = ['knee_left', 'knee_right'];

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the song's notes. Four kinds of beat:
 *  - pose:   one pose, then `beatsPerPose` beats to the next note
 *  - chain:  2..maxChain poses on consecutive beats (a chain bonus if none is missed)
 *  - hold:   one pose to keep for `holdBeats`, then 1 beat to the next
 *  - motion: a move (jumping jacks) for `motionBeats`, with a beat of lead-in so
 *            the player can start early, and 2 beats to recover
 * A pose is never the same as the one before it, so every note needs a real
 * transition (no free hits by standing still). Seeded, so a difficulty plays the
 * same way every run.
 *
 * `pool` lets the caller drop poses the player cannot do (see poseCalibration).
 */
export function buildPoseBeatmap(
  level: PoseLevel,
  durationSec: number = level.seconds,
  seed = 11,
  pool: PoseId[] = level.pool,
  beatOffsetSeconds = 0,
): PoseBeatmap {
  const rand = rng(seed);
  const beat = 60 / level.bpm;
  const phase = Number.isFinite(beatOffsetSeconds)
    ? ((beatOffsetSeconds % beat) + beat) % beat
    : 0;
  const totalBeats = Math.floor(Math.max(0, durationSec - phase) / beat);
  /** Notes must start before this beat. */
  const limit = totalBeats - 1;

  const poses = pool.length >= 2 ? pool : level.pool;
  const holdPoses = poses.filter((p) => !NO_HOLD.includes(p));
  const notes: PoseNote[] = [];
  let prev: NoteTarget | null = null;
  let cursor = FIRST_NOTE_BEAT;
  let chainId = 0;

  const pick = (from: PoseId[], exclude: NoteTarget | null): PoseId | null => {
    const choices = from.filter((p) => p !== exclude);
    return choices.length ? choices[Math.floor(rand() * choices.length)] : null;
  };

  const push = (
    startBeat: number,
    pose: NoteTarget,
    kind: NoteKind,
    durBeats: number,
    chain?: { id: number; index: number; length: number },
  ) => {
    notes.push({
      id: notes.length,
      time: phase + startBeat * beat,
      pose,
      kind,
      duration: durBeats * beat,
      chainId: chain?.id ?? -1,
      chainIndex: chain?.index ?? 0,
      chainLength: chain?.length ?? 1,
    });
    prev = pose;
  };

  while (cursor < limit) {
    const roll = rand();
    const lastKind = notes[notes.length - 1]?.kind;
    const section = songSection(cursor / totalBeats);
    const motionFactor = section === 'intro' ? 0 : section === 'break' ? 0.5 : section === 'final' ? 1.15 : 1;
    const holdFactor = section === 'break' ? 1.5 : section === 'final' ? 0.75 : 1;
    const chainFactor = section === 'intro' ? 0.6 : section === 'chorus' || section === 'final' ? 1.5 : 1;
    const motionChance = level.motionChance * motionFactor;
    const holdChance = level.holdChance * holdFactor;
    const chainChance = level.chainChance * chainFactor;
    const mEnd = motionChance;
    const hEnd = mEnd + holdChance;
    const cEnd = hEnd + chainChance;
    const spacing = section === 'break'
      ? level.beatsPerPose + 1
      : section === 'chorus' || section === 'final'
        ? Math.max(1, level.beatsPerPose - 1)
        : level.beatsPerPose;

    // Motion move
    const motionStart = cursor + 1;
    if (
      roll < mEnd && level.motionBeats > 0 && notes.length >= WARMUP_NOTES &&
      lastKind !== 'motion' && motionStart + level.motionBeats < limit
    ) {
      push(motionStart, 'jumping_jack', 'motion', level.motionBeats);
      cursor = motionStart + level.motionBeats + 2;
      continue;
    }

    // Hold pose
    if (roll >= mEnd && roll < hEnd && level.holdBeats > 0 && cursor + level.holdBeats < limit) {
      const pose = pick(holdPoses, prev);
      if (pose) {
        push(cursor, pose, 'hold', level.holdBeats);
        cursor += level.holdBeats + 1;
        continue;
      }
    }

    // Chain: poses on consecutive beats
    if (roll >= hEnd && roll < cEnd && level.maxChain >= 2) {
      let len = 2 + Math.floor(rand() * (level.maxChain - 1));
      len = Math.min(len, limit - cursor);
      if (len >= 2) {
        const id = chainId++;
        for (let i = 0; i < len; i++) {
          const pose = pick(poses, prev);
          if (!pose) break;
          push(cursor + i, pose, 'pose', 0, { id, index: i, length: len });
        }
        cursor += len - 1 + spacing;
        continue;
      }
    }

    // Single pose
    const pose = pick(poses, prev);
    if (!pose) break;
    push(cursor, pose, 'pose', 0);
    cursor += spacing;
  }

  const last = notes[notes.length - 1];
  for (const target of [0.38, 0.82]) {
    const candidate = notes
      .filter((note) => note.kind === 'pose' && note.chainId < 0 && !note.challenge)
      .reduce<PoseNote | null>((closest, note) => {
        const progress = note.time / Math.max(1, durationSec);
        return !closest || Math.abs(progress - target) < Math.abs(closest.time / Math.max(1, durationSec) - target)
          ? note
          : closest;
      }, null);
    if (candidate) candidate.challenge = 'perfect';
  }
  return { notes, endTime: (last ? noteEnd(last) : 0) + 2 };
}

export function buildPoseBeatmapFromTimeline(
  level: PoseLevel,
  analysis: BeatAnalysis,
  seed = 11,
  pool: PoseId[] = level.pool,
  beatOffsetSeconds = 0,
): PoseBeatmap {
  const rand = rng(seed);
  const poses = pool.length >= 2 ? pool : level.pool;
  const notes: PoseNote[] = [];
  const beats = analysis.beats;
  if (analysis.confidence < 0.12 || beats.length < 8) {
    return { notes, endTime: analysis.durationSeconds };
  }

  const pace = level.maxChain <= 2 ? 9 : level.maxChain >= 4 ? 6 : 7;
  const beatPositions = timelineBeatPositions(beats);
  const offset = Number.isFinite(beatOffsetSeconds) ? beatOffsetSeconds : 0;
  let nextTime = beats[0].time + offset + beats[0].intervalSeconds * 4;
  let previousPose: NoteTarget | null = null;
  let repeatedPose: NoteTarget | null = null;
  let repeatsRemaining = 0;
  let lastTime = -Infinity;
  for (let index = 0; index < beats.length; index++) {
    const beat = beats[index];
    const noteTime = beat.time + offset;
    if (noteTime < nextTime || noteTime >= analysis.durationSeconds - 3 || beat.confidence < 0.12) continue;
    const prior = beats[index - 1];
    const following = beats[index + 1];
    const expectedGap = Math.max(beat.intervalSeconds, prior?.intervalSeconds ?? beat.intervalSeconds);
    if (prior && beat.time - prior.time > expectedGap * 1.65) {
      nextTime = noteTime + beat.intervalSeconds * 2;
      continue;
    }
    if (following && following.time - beat.time > Math.max(beat.intervalSeconds, following.intervalSeconds) * 1.65) {
      nextTime = following.time + offset + following.intervalSeconds * 2;
      repeatedPose = null;
      repeatsRemaining = 0;
      continue;
    }
    const fastBeat = beat.bpm >= 110;
    if (!fastBeat) {
      repeatedPose = null;
      repeatsRemaining = 0;
    }
    const minimumRecovery = fastBeat ? 2.8 : level.maxChain <= 2 ? 3.7 : level.maxChain >= 4 ? 2.7 : 3.1;
    if (noteTime - lastTime < minimumRecovery) continue;

    const isRepeat: boolean = fastBeat && repeatedPose !== null && repeatsRemaining > 0;
    const options = poses.filter((pose) => pose !== previousPose);
    const pose: NoteTarget | null = isRepeat
      ? repeatedPose
      : options[Math.floor(rand() * options.length)];
    if (!pose) continue;
    const canHold = !isRepeat && !NO_HOLD.includes(pose as PoseId) && notes.length > 0;
    const kind: NoteKind = fastBeat
      ? 'pose'
      : canHold && rand() < 0.12 ? 'hold' : rand() < 0.08 ? 'motion' : 'pose';
    const duration = kind === 'hold'
      ? Math.min(beat.intervalSeconds * 2, 2.2)
      : kind === 'motion'
        ? Math.min(beat.intervalSeconds * 4, 3.2)
        : 0;
    const cueLead = Math.max(0.8, Math.min(2.3, beat.intervalSeconds * 1.6));
    notes.push({
      id: notes.length,
      time: noteTime,
      cueTime: Math.max(0, noteTime - cueLead),
      beatSeconds: beat.intervalSeconds,
      beatIndex: beatPositions[index],
      confidence: beat.confidence,
      pose: kind === 'motion' ? 'jumping_jack' : pose,
      kind,
      duration,
      chainId: -1,
      chainIndex: 0,
      chainLength: 1,
    });
    previousPose = pose;
    lastTime = noteTime;
    if (fastBeat) {
      const repeatSpacingSeconds = Math.max(2.8, beat.intervalSeconds * 4);
      if (!isRepeat) {
        repeatedPose = pose;
        repeatsRemaining = 2;
      } else {
        repeatsRemaining--;
      }
      if (repeatsRemaining === 0) repeatedPose = null;
      nextTime = noteTime + repeatSpacingSeconds;
    } else {
      repeatedPose = null;
      repeatsRemaining = 0;
      nextTime = noteTime + beat.intervalSeconds * (pace + Math.floor(rand() * 3));
    }
  }

  for (const target of [0.38, 0.82]) {
    const candidate = notes
      .filter((note) => note.kind === 'pose' && !note.challenge)
      .reduce<PoseNote | null>((closest, note) => {
        const progress = note.time / Math.max(1, analysis.durationSeconds);
        return !closest || Math.abs(progress - target) < Math.abs(closest.time / Math.max(1, analysis.durationSeconds) - target)
          ? note
          : closest;
      }, null);
    if (candidate) candidate.challenge = 'perfect';
  }
  const last = notes[notes.length - 1];
  return { notes, endTime: analysis.durationSeconds || (last ? noteEnd(last) + 2 : 0) };
}
