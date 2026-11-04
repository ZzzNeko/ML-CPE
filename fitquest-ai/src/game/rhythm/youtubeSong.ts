import type { BeatAnalysis } from './youtubeBeatDetection';

export interface YouTubeSongConfig {
  videoId: string;
  bpm?: number;
  durationSeconds?: number;
  beatOffsetSeconds?: number;
}

export interface BuiltInSongConfig {
  id: string;
  bpm: number;
  durationSeconds: number;
}

export interface YouTubeTempo {
  bpm: number;
  beatOffsetSeconds: number;
  confidence: number;
}

export function estimateTempoFromTaps(taps: number[]): YouTubeTempo | null {
  if (taps.length < 8 || taps.some((time) => !Number.isFinite(time) || time < 0)) return null;
  const intervals = taps.slice(1).map((time, index) => time - taps[index]);
  if (intervals.some((interval) => interval <= 0)) return null;
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(sortedIntervals.length / 2);
  const median = sortedIntervals.length % 2
    ? sortedIntervals[middle]
    : (sortedIntervals[middle - 1] + sortedIntervals[middle]) / 2;
  const deviations = intervals.map((interval) => Math.abs(interval - median)).sort((a, b) => a - b);
  const mad = deviations.length % 2
    ? deviations[middle]
    : (deviations[middle - 1] + deviations[middle]) / 2;
  const bpm = Math.round(60 / median);
  if (bpm < 40 || bpm > 220) return null;

  const beat = 60 / bpm;
  const phases = taps.map((time) => (time % beat) / beat * Math.PI * 2);
  const x = phases.reduce((sum, phase) => sum + Math.cos(phase), 0);
  const y = phases.reduce((sum, phase) => sum + Math.sin(phase), 0);
  const beatOffsetSeconds = ((Math.atan2(y, x) / (Math.PI * 2) * beat) + beat) % beat;
  const confidence = Math.max(0, Math.min(1, 1 - (mad / median) * 4));
  return { bpm, beatOffsetSeconds, confidence };
}

const KEY = 'fitquest-youtube-song';
const BUILT_IN_KEY = 'fitquest-built-in-song';
const ACTIVE_KEY = 'fitquest-selected-song-source';
let songTime = 0;
let playing = false;
let lastClockSyncAt = 0;
let durationSeconds = 0;
let currentYouTubeSong: YouTubeSongConfig | null = null;
let currentBuiltInSong: BuiltInSongConfig | null = null;
let activeSource: 'youtube' | 'built-in' | null = null;
let youtubeEnded = false;
let youtubeRhythmAnalysis: { videoId: string; analysis: BeatAnalysis } | null = null;
let clockRevision = 0;

export function setYouTubeRhythmAnalysis(videoId: string, analysis: BeatAnalysis | null) {
  youtubeRhythmAnalysis = analysis ? { videoId, analysis } : null;
}

export function getYouTubeRhythmAnalysis(videoId?: string): BeatAnalysis | null {
  if (videoId && youtubeRhythmAnalysis?.videoId !== videoId) return null;
  return youtubeRhythmAnalysis?.analysis ?? null;
}

export function youtubeVideoId(input: string): string | null {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtube-nocookie.com' || hostname.endsWith('.youtube-nocookie.com')) {
      const id = url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadYouTubeSong(): YouTubeSongConfig | null {
  let source = activeSource;
  try {
    const storedSource = localStorage.getItem(ACTIVE_KEY);
    if (storedSource === 'built-in' || storedSource === 'youtube') source = storedSource;
  } catch {
    // Continue with the in-memory selection when storage is unavailable.
  }
  if (source === 'built-in') return null;
  return readYouTubeSong();
}

export function loadSavedYouTubeSong(): YouTubeSongConfig | null {
  return readYouTubeSong();
}

function readYouTubeSong(): YouTubeSongConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return currentYouTubeSong;
    const value = JSON.parse(raw) as Partial<YouTubeSongConfig>;
    if (typeof value.videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(value.videoId)) return null;
    const bpm = typeof value.bpm === 'number' && Number.isFinite(value.bpm) && value.bpm >= 40 && value.bpm <= 220
      ? Math.round(value.bpm)
      : undefined;
    const durationSeconds = typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0
      ? Math.round(value.durationSeconds)
      : undefined;
    const beatOffsetSeconds = typeof value.beatOffsetSeconds === 'number' && Number.isFinite(value.beatOffsetSeconds) && value.beatOffsetSeconds >= -2 && value.beatOffsetSeconds <= 2
      ? value.beatOffsetSeconds
      : undefined;
    return {
      videoId: value.videoId,
      ...(bpm === undefined ? {} : { bpm }),
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      ...(beatOffsetSeconds === undefined ? {} : { beatOffsetSeconds }),
    };
  } catch {
    return currentYouTubeSong;
  }
}

export function saveYouTubeSong(config: YouTubeSongConfig | null) {
  const previous = loadYouTubeSong();
  currentYouTubeSong = config;
  activeSource = config ? 'youtube' : null;
  if (!config || config.videoId !== previous?.videoId) {
    resetYouTubePlayback();
    durationSeconds = config?.durationSeconds ?? 0;
    if (config?.videoId !== youtubeRhythmAnalysis?.videoId) youtubeRhythmAnalysis = null;
  }
  if (config?.durationSeconds && config.durationSeconds > 0) durationSeconds = config.durationSeconds;
  try {
    if (config) {
      localStorage.setItem(ACTIVE_KEY, 'youtube');
      const saved = {
        ...config,
        durationSeconds: config.durationSeconds ?? (config.videoId === previous?.videoId ? previous.durationSeconds : undefined),
      };
      localStorage.setItem(KEY, JSON.stringify(saved));
    } else {
      localStorage.removeItem(KEY);
      if (localStorage.getItem(ACTIVE_KEY) === 'youtube') localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // Private browsing may block storage; the current session can still use the player.
  }
}

export function loadBuiltInSong(): BuiltInSongConfig | null {
  let source = activeSource;
  try {
    const storedSource = localStorage.getItem(ACTIVE_KEY);
    if (storedSource === 'youtube' || storedSource === 'built-in') source = storedSource;
    if (source === 'youtube') return null;
    const raw = localStorage.getItem(BUILT_IN_KEY);
    if (!raw) return currentBuiltInSong;
    const value = JSON.parse(raw) as Partial<BuiltInSongConfig>;
    if (typeof value.id !== 'string' || !value.id) return null;
    if (typeof value.bpm !== 'number' || value.bpm < 40 || value.bpm > 220) return null;
    if (typeof value.durationSeconds !== 'number' || value.durationSeconds < 20) return null;
    return {
      id: value.id,
      bpm: Math.round(value.bpm),
      durationSeconds: Math.round(value.durationSeconds),
    };
  } catch {
    return source === 'youtube' ? null : currentBuiltInSong;
  }
}

export function saveBuiltInSong(config: BuiltInSongConfig | null) {
  currentBuiltInSong = config;
  activeSource = config ? 'built-in' : null;
  if (config) {
    resetYouTubePlayback();
  }
  try {
    if (config) {
      localStorage.setItem(BUILT_IN_KEY, JSON.stringify(config));
      localStorage.setItem(ACTIVE_KEY, 'built-in');
    } else {
      localStorage.removeItem(BUILT_IN_KEY);
      if (localStorage.getItem(ACTIVE_KEY) === 'built-in') localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // The current selection still applies to this game session if storage is unavailable.
  }
}

export function setYouTubeDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  durationSeconds = Math.round(seconds);
  const current = loadYouTubeSong();
  if (current) currentYouTubeSong = { ...current, durationSeconds };
  if (current && Math.abs((current.durationSeconds ?? 0) - seconds) > 1) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...current, durationSeconds })); } catch { /* Optional storage. */ }
  }
}

export function setYouTubeTempo(bpm: number, beatOffsetSeconds: number) {
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 220 || !Number.isFinite(beatOffsetSeconds) || beatOffsetSeconds < -2 || beatOffsetSeconds > 2) return;
  const current = loadSavedYouTubeSong();
  if (!current) return;
  const updated = { ...current, bpm: Math.round(bpm), beatOffsetSeconds };
  currentYouTubeSong = updated;
  try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch { /* Current session remains usable. */ }
}

export function getYouTubeDuration() {
  return durationSeconds || loadYouTubeSong()?.durationSeconds || 0;
}

export function setYouTubeClock(time: number, isPlaying: boolean) {
  if (Number.isFinite(time) && time >= 0) {
    const expected = songTime + (playing ? Math.max(0, performance.now() - lastClockSyncAt) / 1000 : 0);
    if (Math.abs(time - expected) > 0.75) clockRevision++;
    // Keep the YouTube player's own timeline as the source of truth. Subtracting
    // the first observed playing timestamp reset the beat grid late by the
    // iframe polling delay, making every pose feel behind the music.
    songTime = time;
    lastClockSyncAt = performance.now();
  }
  playing = isPlaying;
}

export function setYouTubeEnded(ended: boolean) {
  youtubeEnded = ended;
}

export function resetYouTubePlayback() {
  songTime = 0;
  playing = false;
  lastClockSyncAt = performance.now();
  youtubeEnded = false;
  clockRevision++;
}

export function isYouTubeEnded() {
  return youtubeEnded;
}

export function getYouTubeClock() {
  // YouTube's currentTime is polled asynchronously. Extrapolate between updates
  // using a monotonic clock so the game does not jump in 250 ms steps.
  const elapsed = playing ? Math.max(0, performance.now() - lastClockSyncAt) / 1000 : 0;
  return { time: songTime + elapsed, playing, revision: clockRevision };
}
