// Checks the Pose Rhythm rules that do not need a camera: beatmap invariants and the
// judging / scoring / fever / chain logic.
// Run: node --experimental-strip-types scripts/verify-pose-rhythm.mjs
import assert from 'node:assert/strict';
import { buildPoseBeatmap, FIRST_NOTE_BEAT, POSE_CUE_BEATS, POSE_LEVELS, shouldAdvancePoseCue, shouldShowPoseCue, songSection } from '../src/game/rhythm/poseBeatmap.ts';
import { POSE_MATCH_THRESHOLD, scoreAllPoses } from '../src/ai/poseTargets.ts';
import { POSE_LANDMARK } from '../src/ai/landmarks.ts';
import { thresholdFor, thresholdFromPeak } from '../src/ai/poseCalibration.ts';
import {
  chainBonus,
  ChainTracker,
  completionGrade,
  FEVER,
  FeverMeter,
  gradeAt,
  holdGrade,
  isPoseMatch,
  MIN_WINDOW_SCALE,
  motionGrade,
  multiplier,
  neighbourGap,
  nextMatchStreak,
  notePoints,
  poseAcquisitionWindows,
  perfectChallengeBonus,
  shouldFinalizePose,
  TargetStats,
  WINDOW,
  windowsForGap,
} from '../src/game/rhythm/poseJudge.ts';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ── beatmap ───────────────────────────────────────────────
const KNEES = ['knee_left', 'knee_right'];
const seen = { chain: 0, hold: 0, motion: 0 };
assert.equal(FIRST_NOTE_BEAT, 4, 'one measure of music plays before the first pose target');
assert.equal(POSE_CUE_BEATS, 1, 'pose guidance appears one beat before its target');
checks += 2;
assert.equal(shouldShowPoseCue(0, 4 * 0.5, 0.5), true, 'the first pose is visible when song time reaches zero');
assert.equal(shouldShowPoseCue(1, 2 * 0.5, 0.5), false, 'later poses stay hidden until one beat before');
assert.equal(shouldShowPoseCue(1, 0.5, 0.5), true, 'later poses appear one beat before their target');
assert.equal(shouldAdvancePoseCue(2, 2.5, 2, 0.5), true, 'the next pose is shown at the current beat, even before the previous note is judged');
assert.equal(shouldAdvancePoseCue(2, 3, 2, 0.5), false, 'the next pose is not shown more than one beat early');
checks += 5;
assert.deepEqual(
  [0.1, 0.2, 0.4, 0.65, 0.9].map(songSection),
  ['intro', 'build', 'chorus', 'break', 'final'],
  'beatmap intensity follows a deterministic song-relative arc',
);
checks++;

for (const [name, level] of Object.entries(POSE_LEVELS)) {
  const beat = 60 / level.bpm;
  for (let seed = 1; seed <= 40; seed++) {
    const map = buildPoseBeatmap(level, level.seconds, seed);
    const { notes } = map;
    const tag = `${name} seed ${seed}`;
    ok(notes.length > 10, `${tag}: has notes`);
    near(notes[0].time / beat, FIRST_NOTE_BEAT, 1e-9);
    assert.deepEqual(buildPoseBeatmap(level, level.seconds, seed), map, `${tag}: deterministic`);
    const challengeNotes = notes.filter((note) => note.challenge === 'perfect');
    ok(challengeNotes.length <= 2, `${tag}: at most two perfect challenges per song`);
    ok(challengeNotes.every((note) => note.kind === 'pose' && note.chainId < 0), `${tag}: challenges do not overlap holds, moves, or chains`);

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], prev = notes[i - 1];
      ok(n.id === i, `${tag}: ids are sequential`);
      ok(n.time + n.duration < level.seconds, `${tag}: note ${i} ends inside the song`);
      if (prev) {
        ok(n.pose !== prev.pose, `${tag}: note ${i} repeats ${n.pose}`);
        const gap = n.time - (prev.time + prev.duration);
        ok(gap >= beat - 1e-9, `${tag}: note ${i} starts <1 beat after the previous one ends (${gap})`);
      }
      if (n.kind === 'hold') {
        seen.hold++;
        near(n.duration, level.holdBeats * beat);
        ok(!KNEES.includes(n.pose), `${tag}: no held knee raise`);
        ok(n.chainId === -1, `${tag}: holds are not in chains`);
        // 1 beat to the next note (2 if that is a motion move, which gets a beat of lead-in)
        const next = notes[i + 1];
        if (next) near(next.time - (n.time + n.duration), next.kind === 'motion' ? 2 * beat : beat, 1e-9);
      }
      if (n.kind === 'motion') {
        seen.motion++;
        ok(level.motionChance > 0, `${name}: motion only on levels that allow it`);
        ok(n.pose === 'jumping_jack', `${tag}: motion is jumping jack`);
        ok(i >= 4, `${tag}: motion not before warm-up`);
        ok(prev?.kind !== 'motion', `${tag}: no back-to-back motion`);
        near(n.duration, level.motionBeats * beat);
        ok(n.chainId === -1, `${tag}: motion is not in a chain`);
        // Lead-in adds one beat to the current section's spacing (holds leave two beats).
        if (prev) {
          const gapBeats = (n.time - (prev.time + prev.duration)) / beat;
          ok(gapBeats >= 2 - 1e-9 && gapBeats <= level.beatsPerPose + 2 + 1e-9,
            `${tag}: motion has a recovery lead-in`);
        }
      }
      if (n.kind === 'pose') near(n.duration, 0);
    }

    // chains: consecutive notes, one beat apart, indexed 0..len-1
    const chains = new Map();
    notes.forEach((n, i) => { if (n.chainId >= 0) (chains.get(n.chainId) ?? chains.set(n.chainId, []).get(n.chainId)).push(i); });
    for (const [id, idx] of chains) {
      seen.chain++;
      const len = idx.length;
      ok(len >= 2 && len <= level.maxChain, `${tag}: chain ${id} length ${len}`);
      idx.forEach((ni, k) => {
        const n = notes[ni];
        ok(n.chainIndex === k && n.chainLength === len, `${tag}: chain ${id} bookkeeping`);
        ok(n.kind === 'pose', `${tag}: chain notes are plain poses`);
        if (k > 0) {
          ok(ni === idx[k - 1] + 1, `${tag}: chain ${id} is contiguous`);
          near(n.time - notes[ni - 1].time, beat, 1e-9);
        }
      });
    }
    ok(map.endTime > notes[notes.length - 1].time, `${tag}: endTime after last note`);
  }
}
ok(seen.chain > 0 && seen.hold > 0 && seen.motion > 0, 'every note kind shows up across seeds');
ok(POSE_LEVELS.easy.motionChance === 0, 'easy has no motion moves');
ok(isPoseMatch(0.5, 0.3, 0.01, 0.2), 'a calibrated geometry match works even when the CNN disagrees');
ok(isPoseMatch(0.1, 0.3, 0.21, 0.2), 'the experimental CNN can independently recognize a pose');
ok(!isPoseMatch(0.1, 0.3, 0.19, 0.2), 'pose is rejected when neither detector reaches its threshold');
ok(isPoseMatch(0.3, 0.3, undefined, 0.2), 'geometry detection remains available without a CNN prediction');
ok(isPoseMatch(0.01, 0.3, 0.21, 0.2, true), 'CNN-only mode accepts a CNN match');
ok(!isPoseMatch(0.5, 0.3, 0.01, 0.2, true), 'CNN-only mode rejects a geometry-only match');
ok(!isPoseMatch(0.5, 0.3, undefined, 0.2, true), 'CNN-only mode rejects missing CNN predictions');

// a custom pool is respected (a player who cannot squat)
{
  const pool = POSE_LEVELS.hard.pool.filter((p) => p !== 'squat');
  for (let seed = 1; seed <= 10; seed++) {
    const { notes } = buildPoseBeatmap(POSE_LEVELS.hard, 150, seed, pool);
    ok(!notes.some((n) => n.pose === 'squat'), 'skipped pose never appears');
  }
}

// Selected-song BPM remains the beatmap's timing grid.
{
  const songBpm = 128;
  const songBeat = 60 / songBpm;
  const songLevel = { ...POSE_LEVELS.normal, bpm: songBpm };
  const { notes } = buildPoseBeatmap(songLevel, 90, 11);
  ok(notes.length > 0, 'selected song tempo produces a beatmap');
  for (const note of notes) {
    near(note.time / songBeat, Math.round(note.time / songBeat), 1e-8);
    if (note.duration > 0) near(note.duration / songBeat, Math.round(note.duration / songBeat), 1e-8);
  }
}

{
  const songBpm = 120;
  const beat = 60 / songBpm;
  const offset = 0.125;
  const level = { ...POSE_LEVELS.normal, bpm: songBpm };
  const { notes } = buildPoseBeatmap(level, 90, 11, level.pool, offset);
  assert.ok(notes.length > 0, 'tempo offset still produces a beatmap');
  near(notes[0].time, offset + FIRST_NOTE_BEAT * beat);
  for (const note of notes) near((note.time - offset) / beat, Math.round((note.time - offset) / beat), 1e-8);
}

// ── pose-match threshold ───────────────────────────────────
{
  assert.equal(POSE_MATCH_THRESHOLD, 0.2, 'pose matching uses a 20% baseline');
  near(thresholdFromPeak(0.7), 0.455);
  near(thresholdFromPeak(0.5), 0.325);
  assert.equal(thresholdFromPeak(0.49), null, 'unreachable calibration pose is still skipped');
  assert.equal(thresholdFor('arms_up', { thresholds: { arms_up: 0.68 }, skipped: [], updatedAt: 0 }), 0.65,
    'personal threshold respects the upper bound');
  assert.equal(thresholdFor('arms_up', { thresholds: { arms_up: 0.1 }, skipped: [], updatedAt: 0 }), 0.2,
    'personal threshold respects the lower bound');
  assert.equal(thresholdFor('arms_up', null), POSE_MATCH_THRESHOLD, 'uncalibrated poses use the default threshold');
  assert.equal(thresholdFor('squat', { thresholds: { squat: 0.65 }, skipped: [], updatedAt: 0 }), 0.35,
    'legacy squat calibration cannot demand an unreachable score');
  checks += 7;
}

// ── pose joint geometry ────────────────────────────────────
{
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const set = (id, x, y, z = 0) => { points[id] = { x, y, z, visibility: 1 }; };
  set(POSE_LANDMARK.LEFT_SHOULDER, 0.4, 0.3);
  set(POSE_LANDMARK.RIGHT_SHOULDER, 0.6, 0.3);
  set(POSE_LANDMARK.LEFT_HIP, 0.45, 0.65);
  set(POSE_LANDMARK.RIGHT_HIP, 0.55, 0.65);
  set(POSE_LANDMARK.LEFT_ELBOW, 0.4, 0.1);
  set(POSE_LANDMARK.RIGHT_ELBOW, 0.6, 0.1);
  set(POSE_LANDMARK.LEFT_WRIST, 0.4, -0.2);
  set(POSE_LANDMARK.RIGHT_WRIST, 0.6, -0.2);

  const straightScore = scoreAllPoses(points, points).arms_up;
  ok(straightScore > 0.9, 'raised, extended arms score as arms up');

  const bent = points.map((point) => ({ ...point }));
  bent[POSE_LANDMARK.LEFT_ELBOW] = { x: 0.3, y: 0.2, z: 0, visibility: 1 };
  bent[POSE_LANDMARK.LEFT_WRIST] = { x: 0.4, y: 0.05, z: 0, visibility: 1 };
  ok(scoreAllPoses(bent, bent).arms_up < 0.1, 'a bent elbow does not pass arms up');

  const screenStraightWorldBent = points.map((point) => ({ ...point }));
  screenStraightWorldBent[POSE_LANDMARK.LEFT_ELBOW] = { x: 0.4, y: 0.1, z: 0, visibility: 1 };
  screenStraightWorldBent[POSE_LANDMARK.LEFT_WRIST] = { x: 0.4, y: -0.2, z: 0, visibility: 1 };
  const world = points.map((point) => ({ ...point }));
  world[POSE_LANDMARK.LEFT_ELBOW] = { x: 0.1, y: 0.1, z: 0, visibility: 1 };
  world[POSE_LANDMARK.LEFT_WRIST] = { x: 0.2, y: 0.2, z: 0, visibility: 1 };
  ok(scoreAllPoses(screenStraightWorldBent, world).arms_up < 0.1,
    'world landmarks reject an elbow bend hidden by the 2D view');

  const screenBentWorldStraight = points.map((point) => ({ ...point }));
  screenBentWorldStraight[POSE_LANDMARK.LEFT_ELBOW] = { x: 0.3, y: 0.2, z: 0, visibility: 1 };
  screenBentWorldStraight[POSE_LANDMARK.LEFT_WRIST] = { x: 0.4, y: 0.05, z: 0, visibility: 1 };
  ok(scoreAllPoses(screenBentWorldStraight, points).arms_up > 0.9,
    'a foreshortened 2D elbow does not reject a straight 3D arm');

  const armsNearHead = points.map((point) => ({ ...point }));
  for (const [elbow, wrist] of [
    [POSE_LANDMARK.LEFT_ELBOW, POSE_LANDMARK.LEFT_WRIST],
    [POSE_LANDMARK.RIGHT_ELBOW, POSE_LANDMARK.RIGHT_WRIST],
  ]) {
    const shoulder = elbow === POSE_LANDMARK.LEFT_ELBOW
      ? POSE_LANDMARK.LEFT_SHOULDER
      : POSE_LANDMARK.RIGHT_SHOULDER;
    const shoulderY = armsNearHead[shoulder].y;
    armsNearHead[elbow] = { ...armsNearHead[elbow], y: shoulderY - 0.0525 };
    armsNearHead[wrist] = { ...armsNearHead[wrist], y: shoulderY - 0.105 };
  }
  ok(scoreAllPoses(armsNearHead, armsNearHead).arms_up >= 0.5,
    'arms reaching head height can meet the calibration peak');

  const oneKneeRaised = points.map((point) => ({ ...point }));
  oneKneeRaised[POSE_LANDMARK.LEFT_KNEE] = { x: 0.35, y: 0.6, z: 0, visibility: 1 };
  oneKneeRaised[POSE_LANDMARK.LEFT_ANKLE] = { x: 0.35, y: 0.4, z: 0, visibility: 1 };
  oneKneeRaised[POSE_LANDMARK.RIGHT_KNEE] = { x: 0.55, y: 0.86, z: 0, visibility: 1 };
  oneKneeRaised[POSE_LANDMARK.RIGHT_ANKLE] = { x: 0.55, y: 1.1, z: 0, visibility: 1 };
  ok(scoreAllPoses(oneKneeRaised, oneKneeRaised).squat < POSE_MATCH_THRESHOLD,
    'raising one knee is not mistaken for a squat');

  const validSquat = points.map((point) => ({ ...point }));
  validSquat[POSE_LANDMARK.LEFT_KNEE] = { x: 0.38, y: 0.7, z: 0, visibility: 1 };
  validSquat[POSE_LANDMARK.RIGHT_KNEE] = { x: 0.62, y: 0.7, z: 0, visibility: 1 };
  validSquat[POSE_LANDMARK.LEFT_ANKLE] = { x: 0.53, y: 0.77, z: 0, visibility: 1 };
  validSquat[POSE_LANDMARK.RIGHT_ANKLE] = { x: 0.47, y: 0.77, z: 0, visibility: 1 };
  const squatScore = scoreAllPoses(validSquat, validSquat).squat;
  ok(squatScore >= thresholdFor('squat', null), 'a balanced squat reaches the live match threshold');
  ok(squatScore >= thresholdFor('squat', { thresholds: { squat: 0.65 }, skipped: [], updatedAt: 0 }),
    'a balanced squat passes even when an older calibration stored the global maximum');
}

// ── windows ───────────────────────────────────────────────
{
  assert.equal(nextMatchStreak(0.3, 0.2, 0), 1);
  assert.equal(nextMatchStreak(0.19, 0.2, 2), 0, 'one weak frame resets the stable pose streak');
  assert.equal(nextMatchStreak(Number.NaN, 0.2, 2), 0, 'invalid pose scores cannot grow the streak');
  assert.equal(perfectChallengeBonus('perfect'), 150);
  assert.equal(perfectChallengeBonus('great'), 0);
  assert.equal(perfectChallengeBonus('miss'), 0);
  checks += 6;

  assert.deepEqual(windowsForGap(Infinity), { ...WINDOW });
  assert.deepEqual(windowsForGap(1.0), { ...WINDOW });
  assert.deepEqual(windowsForGap(60 / 120), { ...WINDOW }, 'dense chains keep the same readable timing bands');
  assert.deepEqual(windowsForGap(60 / 84), { ...WINDOW }, 'all notes use fixed windows');

  const w = { perfect: 0.3, great: 0.6, good: 0.9 };
  assert.equal(gradeAt(0, w), 'perfect');
  assert.equal(gradeAt(-0.3, w), 'perfect');
  assert.equal(gradeAt(0.301, w), 'great');
  assert.equal(gradeAt(-0.6, w), 'great');
  assert.equal(gradeAt(0.7, w), 'good');
  assert.equal(gradeAt(0.91, w), 'miss');
  assert.equal(completionGrade(0.1, w), 'perfect', 'quick completion keeps precise timing grade');
  assert.equal(completionGrade(0.4, w), 'great', 'outside PERFECT is GREAT');
  assert.equal(completionGrade(-0.1, w), 'perfect', 'early completion preserves its negative timing delta');
  assert.equal(completionGrade(-0.4, w), 'great', 'early completion outside PERFECT is GREAT');
  assert.equal(completionGrade(-8, w), 'good', 'very early completion remains GOOD, never MISS');
  assert.equal(completionGrade(8, w), 'good', 'a pose completed long after its beat never expires into MISS');
  checks += 3;
  // Early detection is latched; plain-pose judgement waits for the beat window edge.
  assert.equal(shouldFinalizePose(-0.2, 0.5, false), false, 'early pose is not committed before beat');
  assert.equal(shouldFinalizePose(-0.1, 0.5, false), false, 'early pose is not committed before beat');
  assert.equal(shouldFinalizePose(0, 0.5, false), false, 'perfect waits for the scheduled judgement window');
  assert.equal(shouldFinalizePose(0.2, 0.5, false), false, 'a correct pose does not trigger immediate feedback');
  assert.equal(shouldFinalizePose(0.2, 0.5, false), false, 'pose gets a chance to improve before judgement');
  assert.equal(shouldFinalizePose(0.5, 0.5, false), true, 'pose is judged at the late edge of its beat window');
  assert.equal(shouldFinalizePose(0.5, 0.5, false), true, 'non-perfect result finalizes at late edge');
  assert.equal(shouldFinalizePose(-0.1, 0.5, true), false, 'hold does not start before beat');
  assert.equal(shouldFinalizePose(0, 0.5, true), true, 'hold starts at beat');
  checks += 9;

  const chainHard = windowsForGap(60 / 120);
  const normalAcquire = poseAcquisitionWindows(0.5, w, false);
  near(normalAcquire.early, 0.9);
  near(normalAcquire.late, 0.9);
  const chainAcquire = poseAcquisitionWindows(0.5, chainHard, true);
  near(chainAcquire.early, 0.9);
  near(chainAcquire.late, 0.9);
  ok(-0.6 >= -normalAcquire.early, 'pose held early is acquired before the beat');
  ok(-0.35 >= -chainAcquire.early, 'chain pose can be acquired before its beat');
  checks += 10;

  const notes = [
    { time: 2, duration: 0 }, { time: 3, duration: 0 }, { time: 6, duration: 2 }, { time: 9, duration: 0 },
  ];
  near(neighbourGap(notes, 0), 1);
  near(neighbourGap(notes, 1), 1); // 1 from note 0 vs 3 to the hold
  near(neighbourGap(notes, 2), 3); // hold: gap before is 3, gap to next *start* is 3
  near(neighbourGap(notes, 3), 1); // 1 after the hold ends (8 → 9)
  checks += 4;
}

// ── holds, motion, score ──────────────────────────────────
{
  assert.equal(holdGrade('perfect', 1), 'perfect');
  assert.equal(holdGrade('perfect', 0.85), 'perfect');
  assert.equal(holdGrade('perfect', 0.7), 'great');
  assert.equal(holdGrade('perfect', 0.4), 'good');
  assert.equal(holdGrade('perfect', 0.1), 'good', 'a short hold still earns GOOD');
  assert.equal(holdGrade('good', 1), 'good'); // a hold never upgrades timing
  assert.equal(holdGrade('great', 0.4), 'good');
  assert.equal(holdGrade('miss', 1), 'good', 'legacy MISS timing is normalized to GOOD');
  assert.equal(motionGrade(0.9), 'perfect');
  assert.equal(motionGrade(0.45), 'great');
  assert.equal(motionGrade(0.25), 'good');
  assert.equal(motionGrade(0.05), 'good', 'a short motion still earns GOOD');
  checks += 12;

  near(multiplier(0, false), 1);
  near(multiplier(50, false), 1.5);
  near(multiplier(500, false), 2); // combo bonus is capped
  near(multiplier(100, true), 3); // combo cap + fever
  assert.equal(notePoints('perfect', 'pose', 0, false), 300);
  assert.equal(notePoints('perfect', 'hold', 50, true), 1125);
  assert.equal(notePoints('perfect', 'motion', 100, false), 1200);
  assert.equal(notePoints('miss', 'motion', 100, true), 0);
  assert.equal(chainBonus(3, false, 0, false), 300);
  assert.equal(chainBonus(3, true, 0, false), 600);
  assert.equal(chainBonus(2, false, 50, true), 500);
  checks += 11;
}

// ── chains ────────────────────────────────────────────────
{
  const c = new ChainTracker();
  const n = (chainIndex, chainLength = 3, chainId = 7) => ({ chainId, chainIndex, chainLength });
  assert.equal(c.add({ chainId: -1, chainLength: 1 }, 'perfect'), null);
  assert.equal(c.add(n(0), 'perfect'), null);
  assert.equal(c.add(n(1), 'great'), null);
  assert.deepEqual(c.add(n(2), 'perfect'), { length: 3, broken: false, allPerfect: false });
  // a miss breaks it, even if it is judged after the others
  c.add(n(0, 2, 8), 'perfect');
  assert.deepEqual(c.add(n(1, 2, 8), 'miss'), { length: 2, broken: true, allPerfect: false });
  // all perfect
  c.add(n(0, 2, 9), 'perfect');
  assert.deepEqual(c.add(n(1, 2, 9), 'perfect'), { length: 2, broken: false, allPerfect: true });
  checks += 6;
}

// ── fever ─────────────────────────────────────────────────
{
  const beat = 0.5;
  const f = new FeverMeter();
  let started = 0;
  for (let i = 0; i < 12; i++) started += f.add('perfect', i, beat) ? 1 : 0;
  assert.equal(started, 0);
  near(f.progress(12), 0.96);
  assert.equal(f.add('perfect', 12, beat), true, 'the 13th perfect starts Fever');
  assert.equal(f.starts, 1);
  ok(f.active(12.1), 'fever is on');
  near(f.progress(12), 1);
  near(f.progress(12 + FEVER.beats * beat / 2), 0.5);
  assert.equal(f.add('perfect', 13, beat), false, 'cannot refill while on');
  ok(!f.active(12 + FEVER.beats * beat + 0.01), 'fever ends after its beats');
  near(f.progress(12 + FEVER.beats * beat + 0.01), 0, 1e-9);
  // great fills slower, good not at all, a miss drains but never below 0
  const g = new FeverMeter();
  g.add('great', 0, beat); near(g.progress(0), 0.03);
  g.add('good', 1, beat); near(g.progress(1), 0.03);
  g.add('miss', 2, beat); near(g.progress(2), 0);
  for (let i = 0; i < 5; i++) g.add('perfect', 3 + i, beat);
  near(g.progress(8), 0.4);
  g.add('miss', 9, beat); near(g.progress(9), 0.15);
  checks += 12;
}

// ── per-pose stats ────────────────────────────────────────
{
  const s = new TargetStats();
  for (const g of ['perfect', 'perfect', 'perfect']) s.add('arms_up', g);
  for (const g of ['miss', 'good', 'perfect']) s.add('squat', g);
  s.add('jumping_jack', 'miss');
  const list = s.list();
  assert.deepEqual(list.map((x) => x.target), ['jumping_jack', 'squat', 'arms_up'], 'weakest first');
  assert.deepEqual(list.map((x) => x.accuracy), [0, 44, 100]);
  assert.equal(list[1].total, 3);
  assert.equal(list[1].counts.miss, 1);
  checks += 4;
}

console.log(`POSE RHYTHM OK (${checks} checks)`);
