export interface BeatPoint {
  time: number;
  intervalSeconds: number;
  bpm: number;
  confidence: number;
  energy: number;
}

export interface TempoSegment {
  startSeconds: number;
  endSeconds: number;
  bpm: number;
  beatIntervalSeconds: number;
  confidence: number;
  density: number;
  section: 'intro' | 'build' | 'main' | 'break' | 'outro';
}

export interface BeatAnalysis {
  durationSeconds: number;
  beatOffsetSeconds: number;
  beats: BeatPoint[];
  segments: TempoSegment[];
  confidence: number;
}

export function timelineBeatPositions(beats: BeatPoint[]): number[] {
  const positions: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    if (i === 0) {
      positions.push(0);
      continue;
    }
    const previous = beats[i - 1];
    const current = beats[i];
    const interval = (previous.intervalSeconds + current.intervalSeconds) / 2;
    positions.push(positions[i - 1] + Math.max(1, (current.time - previous.time) / interval));
  }
  return positions;
}

interface FeatureFrame {
  time: number;
  flux: number;
  energy: number;
}

interface LocalTempo {
  start: number;
  end: number;
  intervalSeconds: number;
  bpm: number;
  confidence: number;
  anchor: number;
  density: number;
  energy: number;
  energyThreshold: number;
  activeRatio: number;
}

const FFT_SIZE = 1024;
const HOP_SIZE = 256;
const ANALYSIS_SAMPLE_RATE = 22050;
const SEGMENT_SECONDS = 12;
const SEGMENT_STEP_SECONDS = 6;

function fft(real: Float64Array, imag: Float64Array) {
  const size = real.length;
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle), stepImag = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let wr = 1, wi = 0;
      const half = length >> 1;
      for (let offset = 0; offset < half; offset++) {
        const even = start + offset, odd = even + half;
        const tr = wr * real[odd] - wi * imag[odd];
        const ti = wr * imag[odd] + wi * real[odd];
        real[odd] = real[even] - tr;
        imag[odd] = imag[even] - ti;
        real[even] += tr;
        imag[even] += ti;
        const nextWr = wr * stepReal - wi * stepImag;
        wi = wr * stepImag + wi * stepReal;
        wr = nextWr;
      }
    }
  }
}

function audioFeatures(samples: Float32Array, sampleRate: number): FeatureFrame[] {
  const stride = Math.max(1, Math.round(sampleRate / ANALYSIS_SAMPLE_RATE));
  const rate = sampleRate / stride;
  const frameCount = Math.max(0, Math.floor((samples.length / stride - FFT_SIZE) / HOP_SIZE) + 1);
  const frames: FeatureFrame[] = [];
  const previous = new Float64Array(FFT_SIZE / 2);
  const real = new Float64Array(FFT_SIZE);
  const imag = new Float64Array(FFT_SIZE);
  const input = samples.length / stride;

  for (let frame = 0; frame < frameCount; frame++) {
    const offset = frame * HOP_SIZE * stride;
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const value = samples[Math.min(offset + i * stride, samples.length - 1)] ?? 0;
      energy += value * value;
      real[i] = value * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
      imag[i] = 0;
    }
    fft(real, imag);
    let flux = 0;
    for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
      const magnitude = Math.hypot(real[bin], imag[bin]);
      const increase = magnitude - previous[bin];
      if (increase > 0) flux += increase;
      previous[bin] = magnitude;
    }
    frames.push({
      time: Math.min(input, frame * HOP_SIZE) / rate,
      flux,
      energy: Math.sqrt(energy / FFT_SIZE),
    });
  }
  return frames;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function localTempo(frames: FeatureFrame[], start: number, end: number, frameRate: number) {
  const local = frames.filter((frame) => frame.time >= start && frame.time < end);
  if (local.length < frameRate * 4) return null;
  const flux = local.map((frame) => frame.flux);
  const floor = median(flux);
  const envelope = flux.map((value) => Math.max(0, value - floor));
  const energy = mean(local.map((frame) => frame.energy));
  const peakEnergy = Math.max(...local.map((frame) => frame.energy));
  const energyThreshold = Math.max(0.0015, peakEnergy * 0.08);
  const activeRatio = local.filter((frame) => frame.energy > energyThreshold).length / local.length;
  if (energy < Math.max(0.0015, peakEnergy * 0.06)) return null;

  const minLag = Math.max(1, Math.floor(frameRate * 60 / 180));
  const maxLag = Math.min(Math.floor(frameRate * 60 / 45), Math.floor(envelope.length / 2));
  const correlations: Array<{ lag: number; score: number }> = [];
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let dot = 0, left = 0, right = 0;
    for (let i = lag; i < envelope.length; i++) {
      const a = envelope[i], b = envelope[i - lag];
      dot += a * b;
      left += a * a;
      right += b * b;
    }
    const score = left && right ? dot / Math.sqrt(left * right) : 0;
    correlations.push({ lag, score });
    bestScore = Math.max(bestScore, score);
  }
  const bestLag = correlations.find((item) => item.score >= bestScore * 0.7)?.lag ?? 0;
  const secondScore = correlations
    .filter((item) => Math.abs(item.lag - bestLag) > 2)
    .reduce((maximum, item) => Math.max(maximum, item.score), 0);
  if (!bestLag || bestScore < 0.06) return null;

  const phaseSpan = Math.min(bestLag, envelope.length);
  let phase = 0, phaseScore = -1;
  for (let candidate = 0; candidate < phaseSpan; candidate++) {
    let score = 0, count = 0;
    for (let i = candidate; i < envelope.length; i += bestLag) {
      score += envelope[i];
      count++;
    }
    const normalized = count ? score / Math.sqrt(count) : 0;
    if (normalized > phaseScore) {
      phase = candidate;
      phaseScore = normalized;
    }
  }

  const contrast = bestScore > 0 ? Math.max(0, Math.min(1, (bestScore - secondScore) / bestScore)) : 0;
  const confidence = Math.max(0, Math.min(1, bestScore * (0.45 + contrast * 0.55) * Math.min(1, energy / 0.025)));
  const intervalSeconds = bestLag / frameRate;
  const bpm = 60 / intervalSeconds;
  const anchor = (local[0]?.time ?? start) + phase / frameRate;
  const density = envelope.filter((value) => value > median(envelope) * 1.8).length / Math.max(1, envelope.length);
  return {
    start,
    end,
    intervalSeconds,
    bpm,
    confidence,
    anchor,
    density,
    energy,
    energyThreshold,
    activeRatio,
  } satisfies LocalTempo;
}

function nearestOnset(frames: FeatureFrame[], expected: number, radius: number, fluxThreshold: number) {
  let closest: FeatureFrame | null = null;
  for (const frame of frames) {
    if (frame.time < expected - radius) continue;
    if (frame.time > expected + radius) break;
    if (frame.flux > fluxThreshold && (!closest || frame.flux > closest.flux)) closest = frame;
  }
  return closest;
}

export function analyzeAudioSamples(samples: Float32Array, sampleRate: number): BeatAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < sampleRate * 4) {
    throw new Error('Audio must contain at least four seconds of decoded samples.');
  }
  const durationSeconds = samples.length / sampleRate;
  const frames = audioFeatures(samples, sampleRate);
  const frameRate = (sampleRate / Math.max(1, Math.round(sampleRate / ANALYSIS_SAMPLE_RATE))) / HOP_SIZE;
  if (!frames.length) throw new Error('Audio could not be analyzed.');
  const rawSegments: LocalTempo[] = [];
  for (let start = 0; start < durationSeconds; start += SEGMENT_STEP_SECONDS) {
    const segment = localTempo(frames, start, Math.min(durationSeconds, start + SEGMENT_SECONDS), frameRate);
    if (segment) rawSegments.push(segment);
  }
  if (!rawSegments.length) {
    return { durationSeconds, beatOffsetSeconds: 0, beats: [], segments: [], confidence: 0 };
  }

  const segments: TempoSegment[] = [];
  for (const segment of rawSegments) {
    const center = (segment.start + segment.end) / 2;
    const bounds = {
      startSeconds: Math.max(0, center - SEGMENT_STEP_SECONDS / 2),
      endSeconds: Math.min(durationSeconds, center + SEGMENT_STEP_SECONDS / 2),
    };
    const previous = segments[segments.length - 1];
    if (previous && segment.activeRatio > 0.15 && previous.section !== 'break'
      && Math.abs(previous.bpm - segment.bpm) < 3 && Math.abs(previous.confidence - segment.confidence) < 0.25) {
      previous.endSeconds = bounds.endSeconds;
      previous.confidence = (previous.confidence + segment.confidence) / 2;
      previous.density = (previous.density + segment.density) / 2;
      continue;
    }
    const section: TempoSegment['section'] = segment.activeRatio < 0.1
      ? 'break'
      : bounds.startSeconds < durationSeconds * 0.12
        ? 'intro'
        : bounds.endSeconds > durationSeconds * 0.88
          ? 'outro'
          : segment.density > 0.18 ? 'build' : 'main';
    segments.push({
      ...bounds,
      bpm: Math.round(segment.bpm),
      beatIntervalSeconds: segment.intervalSeconds,
      confidence: segment.confidence,
      density: segment.density,
      section,
    });
  }
  if (segments.length) {
    segments[0].startSeconds = 0;
    segments[segments.length - 1].endSeconds = durationSeconds;
    for (let i = 1; i < segments.length; i++) {
      const boundary = (segments[i - 1].endSeconds + segments[i].startSeconds) / 2;
      segments[i - 1].endSeconds = boundary;
      segments[i].startSeconds = boundary;
    }
    for (let i = segments.length - 1; i > 0; i--) {
      const previous = segments[i - 1], current = segments[i];
      if (current.startSeconds - previous.endSeconds < 2) continue;
      segments.splice(i, 0, {
        startSeconds: previous.endSeconds,
        endSeconds: current.startSeconds,
        bpm: previous.bpm,
        beatIntervalSeconds: previous.beatIntervalSeconds,
        confidence: 0,
        density: 0,
        section: 'break',
      });
    }
    for (const segment of segments) {
      if (segment.section === 'break') continue;
      const startProgress = segment.startSeconds / durationSeconds;
      const endProgress = segment.endSeconds / durationSeconds;
      segment.section = startProgress <= 0.12 && endProgress <= 0.3
        ? 'intro'
        : startProgress >= 0.7 && endProgress >= 0.88
          ? 'outro'
          : segment.density > 0.18 ? 'build' : 'main';
    }
  }

  const beats: BeatPoint[] = [];
  for (const segment of rawSegments) {
    if (segment.confidence < 0.08) continue;
    const start = Math.max(0, segment.start);
    const end = Math.min(durationSeconds, segment.end);
    const threshold = median(frames.filter((frame) => frame.time >= start && frame.time < end).map((frame) => frame.flux)) * 1.4;
    const radius = Math.min(0.12, segment.intervalSeconds * 0.18);
    const first = segment.anchor + Math.ceil((start - segment.anchor) / segment.intervalSeconds) * segment.intervalSeconds;
    for (let expected = first; expected < end; expected += segment.intervalSeconds) {
      const localEnergy = frames
        .filter((frame) => Math.abs(frame.time - expected) <= radius)
        .reduce((maximum, frame) => Math.max(maximum, frame.energy), 0);
      if (localEnergy < segment.energyThreshold) continue;
      const onset = nearestOnset(frames, expected, radius, threshold);
      const time = onset?.time ?? expected;
      const prior = beats[beats.length - 1];
      if (time < 0 || time >= durationSeconds || (prior && time - prior.time < 0.25)) continue;
      beats.push({
        time,
        intervalSeconds: segment.intervalSeconds,
        bpm: segment.bpm,
        confidence: segment.confidence,
        energy: onset?.energy ?? segment.energy,
      });
    }
  }
  beats.sort((a, b) => a.time - b.time);
  const uniqueBeats = beats.filter((beat, index) => index === 0 || beat.time - beats[index - 1].time >= 0.25);
  return {
    durationSeconds,
    beatOffsetSeconds: uniqueBeats[0]?.time ?? 0,
    beats: uniqueBeats,
    segments,
    confidence: mean(segments.map((segment) => segment.confidence)),
  };
}
