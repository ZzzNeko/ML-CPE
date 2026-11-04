let context: AudioContext | null = null;
let master: GainNode | null = null;
let musicTimer: number | null = null;
let noteIndex = 0;
let enabled = false;

function audioGraph() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.12;
    master.connect(context.destination);
  }
  return { ctx: context, master: master! };
}

function tone(frequency: number, duration: number, volume: number, wave: OscillatorType = 'sine') {
  const graph = audioGraph();
  if (!graph) return;
  const { ctx, master: output } = graph;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), ctx.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(output);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.04);
}

export async function startUiAudio() {
  const graph = audioGraph();
  if (!graph) return;
  try { await graph.ctx.resume(); } catch { return; }
  if (enabled) return;
  enabled = true;
  const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23, 220, 277.18, 329.63, 277.18, 246.94, 311.13, 369.99, 311.13];
  const playStep = () => {
    if (!enabled) return;
    const base = melody[noteIndex % melody.length];
    tone(base, 1.05, 0.018, 'sine');
    if (noteIndex % 4 === 0) tone(base / 2, 1.4, 0.012, 'triangle');
    noteIndex += 1;
  };
  playStep();
  musicTimer = window.setInterval(playStep, 560);
}

export function playUiHover() {
  if (!enabled) return;
  tone(660, 0.065, 0.022, 'sine');
}

export function playUiClick() {
  if (!enabled) void startUiAudio();
  tone(880, 0.09, 0.035, 'triangle');
}

export function stopUiAudio() {
  enabled = false;
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  if (context && context.state !== 'closed') void context.suspend();
}
