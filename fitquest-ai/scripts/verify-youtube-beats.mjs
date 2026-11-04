import assert from 'node:assert/strict';
import { analyzeAudioSamples } from '../src/game/rhythm/youtubeBeatDetection.ts';
import { buildPoseBeatmapFromTimeline, POSE_LEVELS, selectVisiblePoseCue } from '../src/game/rhythm/poseBeatmap.ts';
import {
  getYouTubeClock,
  resetYouTubePlayback,
  setYouTubeClock,
  setYouTubeRhythmAnalysis,
  getYouTubeRhythmAnalysis,
} from '../src/game/rhythm/youtubeSong.ts';

function syntheticTrack(parts, sampleRate = 11025) {
  const duration = parts.reduce((total, part) => total + part.seconds, 0);
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  let base = 0;
  for (const part of parts) {
    if (part.bpm) {
      const interval = 60 / part.bpm;
      for (let time = 0.25; time < part.seconds; time += interval) {
        const start = Math.floor((base + time) * sampleRate);
        for (let i = 0; i < Math.floor(0.12 * sampleRate) && start + i < samples.length; i++) {
          samples[start + i] = Math.sin((2 * Math.PI * 880 * i) / sampleRate)
            * Math.exp(-i / (sampleRate * 0.025)) * 0.8;
        }
      }
    }
    base += part.seconds;
  }
  return { samples, sampleRate };
}

const constant = analyzeAudioSamples(...Object.values(syntheticTrack([{ seconds: 24, bpm: 120 }])));
assert.ok(constant.confidence > 0.12, 'a stable beat has usable confidence');
assert.ok(constant.beats.length >= 35, 'constant tempo produces timestamps across the track');
assert.ok(constant.segments.some((segment) => Math.abs(segment.bpm - 120) <= 8), 'constant tempo is estimated near 120 BPM');
assert.ok(constant.beatOffsetSeconds >= 0 && constant.beatOffsetSeconds < 1, 'first detected beat exposes its audio offset');
const fastMap = buildPoseBeatmapFromTimeline(POSE_LEVELS.normal, constant, 17);
assert.ok(fastMap.notes.some((note, index) => index > 0 && note.pose === fastMap.notes[index - 1].pose), 'fast tempo repeats a pose instead of requiring a new transition every cue');
for (let index = 0; index < fastMap.notes.length; index++) {
  const previous = fastMap.notes[index - 1];
  if (!previous) continue;
  assert.ok(fastMap.notes[index].time - previous.time >= 2.8, 'fast-tempo repetitions still leave time to hold the pose');
}
assert.ok(fastMap.notes.length / (constant.durationSeconds / 60) <= 22, 'fast-tempo repetitions keep note rate bounded');

const changing = analyzeAudioSamples(...Object.values(syntheticTrack([
  { seconds: 18, bpm: 80 },
  { seconds: 18, bpm: 120 },
  { seconds: 18, bpm: 90 },
])));
assert.ok(changing.segments.some((segment) => segment.startSeconds < 8 && segment.bpm >= 70 && segment.bpm <= 100), 'slow intro tempo is detected');
assert.ok(changing.segments.some((segment) => segment.startSeconds >= 15 && segment.startSeconds < 35 && segment.bpm >= 105 && segment.bpm <= 140), 'faster main tempo is detected');
assert.ok(changing.segments.some((segment) => segment.startSeconds >= 38 && segment.bpm >= 80 && segment.bpm <= 105), 'slower outro tempo is detected');
assert.ok(changing.segments.some((segment) => segment.section === 'intro'), 'the opening section is labeled');
assert.ok(changing.segments.some((segment) => segment.section === 'outro'), 'the outro section is labeled');

const broken = analyzeAudioSamples(...Object.values(syntheticTrack([
  { seconds: 18, bpm: 100 },
  { seconds: 8, bpm: null },
  { seconds: 18, bpm: 100 },
])));
assert.ok(broken.segments.some((segment) => segment.section === 'break'), 'a silent interval is represented as a break');
assert.ok(!broken.beats.some((beat) => beat.time >= 18 && beat.time < 26), 'silent intervals do not receive synthetic beat timestamps');
const map = buildPoseBeatmapFromTimeline(POSE_LEVELS.normal, broken, 23);
const offsetMap = buildPoseBeatmapFromTimeline(POSE_LEVELS.normal, broken, 23, POSE_LEVELS.normal.pool, 0.125);
assert.ok(map.notes.length > 0, 'active portions still produce poses');
assert.equal(Math.round((offsetMap.notes[0].time - map.notes[0].time) * 1000), 125, 'timeline offsets shift judgement beats without tempo drift');
assert.ok(map.notes.every((note) => note.cueTime < note.time), 'each pose is cued before its judgement beat');
const queued = [
  { id: 0, time: 5, cueTime: 4, beatSeconds: 0.6 },
  { id: 1, time: 9, cueTime: 8, beatSeconds: 0.6 },
  { id: 2, time: 12, cueTime: 9.5, beatSeconds: 0.6 },
];
assert.equal(
  selectVisiblePoseCue(queued, (note) => note.id < 2)?.id,
  2,
  'cue selection scans upcoming poses after the current pose is completed',
);
assert.equal(
  selectVisiblePoseCue(queued, (note) => note.id === 0)?.id,
  1,
  'the next pose is visible even well before its cue time',
);
assert.ok(!map.notes.some((note) => note.time >= 18 && note.time < 26), 'no poses are generated in a silent break');
assert.ok(map.notes.every((note, index) => index === 0 || note.time - map.notes[index - 1].time >= 3.1), 'normal notes leave recovery time');
assert.ok(map.notes.length / (broken.durationSeconds / 60) <= 20, 'normal note density stays exercise-appropriate');
assert.ok(map.notes.every((note, index) => index === 0 || note.pose !== map.notes[index - 1].pose), 'neighboring poses do not repeat');

const lowConfidence = analyzeAudioSamples(new Float32Array(11025 * 12), 11025);
assert.equal(lowConfidence.confidence, 0, 'silence reports zero detection confidence');
assert.equal(lowConfidence.beats.length, 0, 'silence does not invent beats');

setYouTubeRhythmAnalysis('abcdefghijk', changing);
assert.equal(getYouTubeRhythmAnalysis('abcdefghijk'), changing, 'analysis is associated with its selected video');
assert.equal(getYouTubeRhythmAnalysis('lmnopqrstuv'), null, 'analysis is not reused for a different video');
const initialRevision = getYouTubeClock().revision;
setYouTubeClock(23, true);
assert.ok(getYouTubeClock().time >= 23, 'playback clock follows the player time');
assert.ok(getYouTubeClock().revision > initialRevision, 'a discontinuous player time change is surfaced as a seek');
setYouTubeClock(42, false);
assert.equal(getYouTubeClock().time, 42, 'seeking while paused re-anchors the clock');
setYouTubeClock(45, true);
await new Promise((resolve) => setTimeout(resolve, 20));
assert.ok(getYouTubeClock().time >= 45, 'resume advances from the new seek time');
resetYouTubePlayback();
assert.equal(getYouTubeClock().time, 0, 'replay resets playback to the beginning');

console.log('YOUTUBE BEAT FLOW OK (tempo, breaks, confidence, cue lead, density, pause, seek, replay)');
