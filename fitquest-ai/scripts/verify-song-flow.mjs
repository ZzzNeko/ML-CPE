import assert from 'node:assert/strict';
import {
  estimateTempoFromTaps,
  getYouTubeClock,
  isYouTubeEnded,
  loadBuiltInSong,
  loadSavedYouTubeSong,
  loadYouTubeSong,
  resetYouTubePlayback,
  saveBuiltInSong,
  saveYouTubeSong,
  setYouTubeClock,
  setYouTubeDuration,
  setYouTubeEnded,
  setYouTubeTempo,
  youtubeVideoId,
} from '../src/game/rhythm/youtubeSong.ts';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const videoId = 'abcdefghijk';
const eightTaps = Array.from({ length: 8 }, (_, index) => 0.125 + index * 0.5);
const stableTempo = estimateTempoFromTaps(eightTaps);
assert.deepEqual(stableTempo, { bpm: 120, beatOffsetSeconds: 0.125, confidence: 1 });
const noisyTempo = estimateTempoFromTaps([0, 0.3, 0.7, 1.2, 1.8, 2.5, 2.9, 3.5]);
assert.ok(noisyTempo && noisyTempo.confidence < 0.55, 'inconsistent taps report low confidence');
assert.equal(estimateTempoFromTaps(eightTaps.slice(0, 7)), null, 'tempo requires eight taps');
assert.equal(estimateTempoFromTaps([0, 1, 1, 2, 3, 4, 5, 6]), null, 'duplicate taps are rejected');
assert.equal(estimateTempoFromTaps(Array.from({ length: 8 }, (_, index) => index * 2)), null, 'out-of-range tempo is rejected');

assert.equal(youtubeVideoId(videoId), videoId);
assert.equal(youtubeVideoId(`https://youtu.be/${videoId}?t=30`), videoId);
assert.equal(youtubeVideoId(`https://www.youtube.com/watch?v=${videoId}`), videoId);
assert.equal(youtubeVideoId(`https://youtube.com/shorts/${videoId}`), videoId);
assert.equal(youtubeVideoId(`https://www.youtube-nocookie.com/embed/${videoId}`), videoId);
assert.equal(youtubeVideoId(`https://not-youtube.example/watch?v=${videoId}`), null);
assert.equal(youtubeVideoId(`ftp://youtube.com/watch?v=${videoId}`), null);
assert.equal(youtubeVideoId('short-id'), null);

const builtIn = { id: 'neon-steps', bpm: 120, durationSeconds: 135 };
const youtube = { videoId, bpm: 128, durationSeconds: 160 };
saveBuiltInSong(builtIn);
assert.deepEqual(loadBuiltInSong(), builtIn);
assert.equal(loadYouTubeSong(), null);

saveYouTubeSong(youtube);
assert.deepEqual(loadYouTubeSong(), youtube);
assert.deepEqual(loadSavedYouTubeSong(), youtube);
assert.equal(loadBuiltInSong(), null);
assert.equal(isYouTubeEnded(), false);
setYouTubeEnded(true);
assert.equal(isYouTubeEnded(), true);
setYouTubeClock(160, false);
resetYouTubePlayback();
assert.equal(isYouTubeEnded(), false, 'a replay clears the previous ended state');
assert.equal(getYouTubeClock().time, 0, 'a replay resets the YouTube song clock');

saveBuiltInSong(builtIn);
assert.equal(loadYouTubeSong(), null);
assert.deepEqual(loadSavedYouTubeSong(), youtube);
assert.deepEqual(loadBuiltInSong(), builtIn);
assert.equal(isYouTubeEnded(), false);

saveYouTubeSong(youtube);
assert.equal(isYouTubeEnded(), false);
setYouTubeDuration(1200.4);
assert.equal(loadYouTubeSong()?.durationSeconds, 1200, 'YouTube duration is not capped by the entry form');
setYouTubeTempo(120, 0.125);
assert.deepEqual(loadYouTubeSong(), { videoId, bpm: 120, durationSeconds: 1200, beatOffsetSeconds: 0.125 });
setYouTubeClock(23, true);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.ok(getYouTubeClock().time > 23);
setYouTubeClock(24, false);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(getYouTubeClock().time, 24);

globalThis.localStorage = {
  getItem: () => { throw new Error('storage unavailable'); },
  setItem: () => { throw new Error('storage unavailable'); },
  removeItem: () => { throw new Error('storage unavailable'); },
};
saveBuiltInSong(builtIn);
assert.deepEqual(loadBuiltInSong(), builtIn);
saveYouTubeSong(youtube);
assert.deepEqual(loadYouTubeSong(), youtube);

console.log('SONG FLOW OK (YouTube selection, playback clock, and replay reset)');
