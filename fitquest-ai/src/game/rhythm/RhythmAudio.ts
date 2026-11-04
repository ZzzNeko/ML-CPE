import { loadSettings } from '../../ui/settings';

export type HitGrade = 'perfect' | 'great' | 'good' | 'miss';

export const COUNT_IN_BEAT_SECONDS = 1;
export const COUNT_IN_GO_SECONDS = 0.75;
export const COUNT_IN_START_GAP_SECONDS = 0.25;
export const COUNT_IN_POST_SECONDS = COUNT_IN_GO_SECONDS + COUNT_IN_START_GAP_SECONDS;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** A–minor loop: Am · F · C · G. `root` is the bass note, `tones` the chord. */
const CHORDS = [
  { root: 33, tones: [57, 60, 64] },
  { root: 29, tones: [53, 57, 60] },
  { root: 36, tones: [55, 60, 64] },
  { root: 31, tones: [55, 59, 62] },
];
/** Chorus progression (Dm · G · C · Am) — every third section, so a long song does not loop one chord cycle. */
const CHORDS_B = [
  { root: 38, tones: [57, 62, 65] },
  { root: 31, tones: [55, 59, 62] },
  { root: 36, tones: [55, 60, 64] },
  { root: 33, tones: [57, 60, 64] },
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
/** Lead melody (chord-tone indices), one per beat, from bar 8 on. */
const LEAD = [2, 1, 0, 1, 2, 2, 1, 0];

/**
 * Synthesised backing track + hit sounds, so the game needs no audio files.
 * Beats are scheduled ahead of time on the AudioContext clock, which doubles as
 * the game's song clock — visuals and sound stay locked together.
 */
export class RhythmAudio {
  private ctx: AudioContext | null = null;
  private musicOut: GainNode | null = null;
  private effectOut: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | undefined;
  private songStart = 0;
  private perfStart = 0;
  private stepDur = 0.25;
  private nextStep = 0;
  private lastStep = 0;
  private silentBacking = false;
  private disposed = false;
  private settingsListener?: (event: Event) => void;

  async start(bpm: number, leadBeats: number, lastStep: number, silentBacking = false): Promise<void> {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const beat = 60 / bpm;
    this.stepDur = beat / 2;
    this.lastStep = lastStep;
    this.silentBacking = silentBacking;
    const preRollSeconds = leadBeats * COUNT_IN_BEAT_SECONDS + COUNT_IN_POST_SECONDS;
    this.nextStep = 0;
    this.perfStart = performance.now() / 1000 + 0.3 + preRollSeconds;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;
    try {
      await ctx.resume();
    } catch (error) {
      console.warn('[RhythmAudio] AudioContext resume failed; continuing with the performance clock.', error);
    }
    if (this.disposed) {
      void ctx.close();
      return;
    }

    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    const musicOut = ctx.createGain();
    musicOut.gain.value = loadSettings().musicVolume / 100 * 0.7;
    musicOut.connect(comp);
    this.musicOut = musicOut;
    const effectOut = ctx.createGain();
    effectOut.gain.value = loadSettings().effectVolume / 100 * 0.7;
    effectOut.connect(comp);
    this.effectOut = effectOut;
    this.settingsListener = (event: Event) => {
      const settings = (event as CustomEvent<{ musicVolume?: number; effectVolume?: number }>).detail;
      if (!this.ctx) return;
      const musicVolume = Math.max(0, Math.min(100, settings?.musicVolume ?? loadSettings().musicVolume)) / 100 * 0.7;
      const effectVolume = Math.max(0, Math.min(100, settings?.effectVolume ?? loadSettings().effectVolume)) / 100 * 0.7;
      this.musicOut?.gain.setTargetAtTime(musicVolume, this.ctx.currentTime, 0.025);
      this.effectOut?.gain.setTargetAtTime(effectVolume, this.ctx.currentTime, 0.025);
    };
    window.addEventListener('fitquest:settings-changed', this.settingsListener);

    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.songStart = ctx.currentTime + 0.3 + preRollSeconds;
    this.perfStart = performance.now() / 1000 + 0.3 + preRollSeconds;
    this.timer = window.setInterval(() => this.pump(), 25);
    for (let count = 0; count < leadBeats; count++) {
      const when = ctx.currentTime + 0.3 + count * COUNT_IN_BEAT_SECONDS;
      this.tone(when, count === 0 ? 1000 : 1500, 0.07, 'sine', 0.3, 0.002);
    }
    this.pump();
  }

  /** Change BPM while preserving the current song position; future beats use the new tempo. */
  setTempo(bpm: number, endTime?: number): void {
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 220) return;
    const current = this.songTime();
    const nextStepDur = 30 / bpm;
    if (Math.abs(nextStepDur - this.stepDur) < 0.0001) return;
    this.stepDur = nextStepDur;
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running' && this.musicOut) {
      const latency = ctx.outputLatency || ctx.baseLatency || 0;
      this.songStart = ctx.currentTime - current - latency;
    }
    this.perfStart = performance.now() / 1000 - current;
    // Avoid replaying past beats. Future steps are rescheduled on the new grid.
    this.nextStep = Math.max(0, Math.floor(current / this.stepDur) + 1);
    if (endTime !== undefined && Number.isFinite(endTime)) this.lastStep = Math.ceil((endTime / this.stepDur) * 2);
    this.pump();
  }

  /** Seconds since the first beat (negative during the count-in). */
  songTime(): number {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running' && this.musicOut) {
      const latency = ctx.outputLatency || ctx.baseLatency || 0;
      return ctx.currentTime - this.songStart - latency;
    }
    return performance.now() / 1000 - this.perfStart;
  }

  stop() {
    this.disposed = true;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.settingsListener) window.removeEventListener('fitquest:settings-changed', this.settingsListener);
    this.settingsListener = undefined;
    const ctx = this.ctx;
    if (!ctx) return;
    this.musicOut?.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    this.effectOut?.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    window.setTimeout(() => void ctx.close().catch(() => {}), 300);
    this.ctx = null;
    this.musicOut = null;
    this.effectOut = null;
  }

  hitSound(grade: HitGrade) {
    const ctx = this.ctx;
    if (!ctx || !this.effectOut) return;
    const t = ctx.currentTime;
    if (grade === 'miss') {
      // Clearly audible descending "wrong" cue, distinct from the musical hit chimes.
      this.tone(t, 260, 0.08, 'sawtooth', 0.28, 0.002, 1200);
      this.tone(t + 0.075, 150, 0.16, 'triangle', 0.32, 0.002, 700);
      return;
    }
    const freq = grade === 'perfect' ? 1568 : grade === 'great' ? 1175 : 880;
    this.tone(t, freq, 0.09, 'sine', 0.24, 0.002);
  }

  /** Rising chime for a completed chain. */
  chainSound(perfect: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.effectOut) return;
    const t = ctx.currentTime;
    const notes = perfect ? [1047, 1319, 1568, 2093] : [880, 1175, 1480];
    notes.forEach((f, i) => this.tone(t + i * 0.06, f, 0.12, 'sine', 0.2, 0.002));
  }

  /** Bright sweep when Fever starts. */
  feverSound() {
    const ctx = this.ctx;
    if (!ctx || !this.effectOut) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.05, f, 0.28, 'triangle', 0.18, 0.004));
  }

  // ── scheduling ────────────────────────────────────────────

  private pump() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOut) return;
    while (this.nextStep <= this.lastStep) {
      const when = this.songStart + this.nextStep * this.stepDur;
      if (when > ctx.currentTime + 0.15) break;
      this.scheduleStep(this.nextStep, when);
      this.nextStep++;
    }
  }

  private scheduleStep(step: number, t: number) {
    const onBeat = Math.abs(step) % 2 === 0;
    if (this.silentBacking) return;
    const beat = Math.floor(step / 2);
    const bar = Math.floor(beat / 4);
    const inBar = beat % 4;
    const section = Math.floor(bar / 4);
    const chord = (section % 4 === 2 ? CHORDS_B : CHORDS)[bar % 4];

    if (onBeat) this.kick(t);
    if (onBeat && (inBar === 1 || inBar === 3) && bar >= 1) this.hit(t, 'bandpass', 1900, 0.16, 0.5);
    if (bar >= 1 || !onBeat) this.hit(t, 'highpass', 7500, onBeat ? 0.03 : 0.07, onBeat ? 0.12 : 0.2);

    if (bar >= 1) this.tone(t, midi(chord.root + (onBeat ? 0 : 12)), this.stepDur * 0.9, 'triangle', onBeat ? 0.34 : 0.18, 0.005, 700, 'music');
    if (bar >= 2) this.tone(t, midi(chord.tones[ARP[step % ARP.length] % 3] + 12), this.stepDur * 1.6, 'triangle', 0.12, 0.004, 2600, 'music');
    if (bar >= 8 && onBeat) this.tone(t, midi(chord.tones[LEAD[beat % LEAD.length]] + 24), this.stepDur * 1.8, 'sine', 0.08, 0.01, 3200, 'music');
    if (onBeat && inBar === 0) for (const n of chord.tones) this.tone(t, midi(n), this.stepDur * 7, 'sine', 0.05, 0.35, undefined, 'music');
  }

  // ── voices ────────────────────────────────────────────────

  private kick(t: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicOut) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.95, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.musicOut);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private hit(t: number, type: BiquadFilterType, freq: number, dur: number, peak: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicOut || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.musicOut);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, freq: number, dur: number, type: OscillatorType, peak: number, attack = 0.005, cutoff?: number, bus: 'music' | 'effects' = 'effects') {
    const ctx = this.ctx;
    const output = bus === 'music' ? this.musicOut : this.effectOut;
    if (!ctx || !output) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    if (cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      osc.connect(lp).connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(output);
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
  }
}
