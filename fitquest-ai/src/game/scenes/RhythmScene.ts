import Phaser from 'phaser';
import { poseDetector } from '../../ai/PoseDetector';
import type { Landmark } from '../../ai/types';
import { CAMERA_CONFIG, GAME_CONFIG, POSE_CONFIG } from '../../data/gameConfig';
import { loadSettings } from '../../ui/settings';
import { eventBus, GameEvents } from '../EventBus';
import { buildBeatmap, LEAD_BEATS, RHYTHM_LEVELS, type Note, type RhythmLevel } from '../rhythm/beatmap';
import { RhythmAudio, type HitGrade } from '../rhythm/RhythmAudio';
import type { ResultData } from './ResultScene';

const IVORY = 0xf2efe9;
const CHAMPAGNE = 0xcdb892;
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = 'Inter, "Noto Sans Thai", system-ui, sans-serif';

/** Timing windows in seconds. Pose tracking has latency and jitter, so hands get wider windows. */
const WINDOWS = {
  pointer: { perfect: 0.07, great: 0.13, good: 0.2 },
  pose: { perfect: 0.13, great: 0.23, good: 0.34 },
} as const;
type Source = keyof typeof WINDOWS;
const MISS_AFTER = WINDOWS.pose.good;

const POINTS = { perfect: 300, great: 150, good: 50, miss: 0 } as const;
const WEIGHT = { perfect: 1, great: 0.66, good: 0.33, miss: 0 } as const;
const GRADE = {
  perfect: { text: 'PERFECT', color: IVORY, css: '#f2efe9' },
  great: { text: 'GREAT', color: CHAMPAGNE, css: '#cdb892' },
  good: { text: 'GOOD', color: 0x9a968c, css: '#b5b0a4' },
  miss: { text: 'MISS', color: 0xc4837c, css: '#c4837c' },
} as const;

interface LiveNote extends Note {
  state: 'pending' | 'done';
  /** Set once a hand has been seen outside the circle during its hit window. */
  armed: boolean;
  text?: Phaser.GameObjects.Text;
}

interface Point {
  x: number;
  y: number;
}

export class RhythmScene extends Phaser.Scene {
  private audio = new RhythmAudio();
  private level!: RhythmLevel;
  private notes: LiveNote[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private endTime = 0;
  private ready = false;
  private ended = false;

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private hits = 0;
  private judged = 0;
  private weightSum = 0;
  private counts = { perfect: 0, great: 0, good: 0, miss: 0 };

  private rawHands: Point[] = [];
  private lastPoseAt = 0;
  private lastSecond = -1;
  private lastCount = 0;

  private offPose?: () => void;
  private offQuit?: () => void;

  constructor() {
    super('Rhythm');
  }

  create() {
    const { width, height } = GAME_CONFIG;
    this.level = RHYTHM_LEVELS[loadSettings().difficulty];
    const map = buildBeatmap(this.level, GAME_CONFIG.timeChallengeSeconds, { width, height });
    this.notes = map.notes.map((n) => ({ ...n, state: 'pending', armed: false }));
    this.endTime = map.endTime;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.judged = 0;
    this.weightSum = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.rawHands = [];
    this.ready = false;
    this.ended = false;
    this.lastSecond = -1;
    this.lastCount = 0;

    this.g = this.add.graphics().setDepth(5);

    eventBus.emit(GameEvents.SCENE_CHANGED, 'Rhythm');
    eventBus.emit(GameEvents.SCENE_READY, 'Rhythm');
    eventBus.emit(GameEvents.SCORE_UPDATED, 0);
    eventBus.emit(GameEvents.COMBO_UPDATED, 0);
    eventBus.emit(GameEvents.REP_COUNTED, 0);
    eventBus.emit(GameEvents.RHYTHM_ACCURACY, 100);

    this.offPose = poseDetector.subscribe((state) => this.onPose(state.frame?.landmarks ?? null));
    this.offQuit = eventBus.on(GameEvents.RHYTHM_QUIT, () => this.scene.start('Menu'));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pointerHit(p.x, p.y));

    this.audio = new RhythmAudio();
    const lastStep = Math.ceil((this.endTime / (60 / this.level.bpm)) * 2);
    void this.audio.start(this.level.bpm, LEAD_BEATS, lastStep).then(() => {
      this.ready = true;
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audio.stop();
      this.offPose?.();
      this.offQuit?.();
      this.offPose = undefined;
      this.offQuit = undefined;
      this.input.off('pointerdown');
    });
  }

  update() {
    if (!this.ready || this.ended) return;
    const t = this.audio.songTime();

    this.showCountIn(t);
    const hands = this.handsInGame();
    this.poseHits(t, hands);

    for (const n of this.notes) {
      if (n.state === 'pending' && t > n.time + MISS_AFTER) this.finish(n, 'miss');
    }

    this.draw(t, hands);

    const remaining = Math.max(0, Math.ceil(this.endTime - t));
    if (remaining !== this.lastSecond) {
      this.lastSecond = remaining;
      eventBus.emit('timer-updated', remaining);
    }
    if (t >= this.endTime) this.endGame();
  }

  // ── input ─────────────────────────────────────────────────

  private onPose(landmarks: Landmark[] | null) {
    if (!landmarks) {
      this.rawHands = [];
      return;
    }
    const seen = (p?: Landmark) => (p?.visibility ?? 0) >= POSE_CONFIG.visibilityThreshold;
    const hands: Point[] = [];
    // Index fingertip when visible, otherwise the wrist: [left tip, left wrist], [right tip, right wrist]
    for (const [tip, wrist] of [[19, 15], [20, 16]]) {
      const p = seen(landmarks[tip]) ? landmarks[tip] : seen(landmarks[wrist]) ? landmarks[wrist] : null;
      if (p) hands.push({ x: p.x, y: p.y });
    }
    this.rawHands = hands;
    this.lastPoseAt = performance.now();
  }

  /** Map normalised camera coords to game coords, matching how the camera fills the screen. */
  private handsInGame(): Point[] {
    if (!this.rawHands.length || performance.now() - this.lastPoseAt > 400) return [];
    const canvas = this.game.canvas;
    const parent = this.scale.parent ?? canvas.parentElement;
    if (!parent) return [];
    const pr = parent.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    if (!cr.width || !cr.height) return [];
    return this.rawHands.map((h) => {
      const nx = CAMERA_CONFIG.mirror ? 1 - h.x : h.x;
      const sx = pr.left + nx * pr.width;
      const sy = pr.top + h.y * pr.height;
      return { x: ((sx - cr.left) / cr.width) * GAME_CONFIG.width, y: ((sy - cr.top) / cr.height) * GAME_CONFIG.height };
    });
  }

  private poseHits(t: number, hands: Point[]) {
    if (!hands.length) return;
    const reach = this.level.radius + 14;
    for (const n of this.notes) {
      if (n.state !== 'pending') continue;
      const dt = Math.abs(t - n.time);
      if (dt > WINDOWS.pose.good) continue;
      const inside = hands.some((h) => Math.hypot(h.x - n.x, h.y - n.y) <= reach);
      if (!inside) {
        n.armed = true;
      } else if (n.armed || dt <= WINDOWS.pose.perfect) {
        // A hand already parked on the circle only counts once the perfect window opens.
        this.judge(n, dt, 'pose');
      }
    }
  }

  private pointerHit(x: number, y: number) {
    if (!this.ready || this.ended) return;
    const t = this.audio.songTime();
    let best: LiveNote | null = null;
    for (const n of this.notes) {
      if (n.state !== 'pending') continue;
      if (Math.abs(t - n.time) > WINDOWS.pointer.good) continue;
      if (Math.hypot(x - n.x, y - n.y) > this.level.radius + 4) continue;
      if (!best || n.time < best.time) best = n;
    }
    if (best) this.judge(best, Math.abs(t - best.time), 'pointer');
  }

  // ── judging ───────────────────────────────────────────────

  private judge(n: LiveNote, dt: number, source: Source) {
    const w = WINDOWS[source];
    this.finish(n, dt <= w.perfect ? 'perfect' : dt <= w.great ? 'great' : 'good');
  }

  private finish(n: LiveNote, grade: HitGrade) {
    n.state = 'done';
    this.counts[grade] += 1;
    this.judged += 1;
    this.weightSum += WEIGHT[grade];

    if (grade === 'miss') {
      this.combo = 0;
    } else {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.hits += 1;
      this.score += Math.round(POINTS[grade] * (1 + Math.min(this.combo, 100) / 100));
    }

    eventBus.emit(GameEvents.SCORE_UPDATED, this.score);
    eventBus.emit(GameEvents.COMBO_UPDATED, this.combo);
    eventBus.emit(GameEvents.REP_COUNTED, this.hits);
    eventBus.emit(GameEvents.RHYTHM_ACCURACY, Math.round((this.weightSum / this.judged) * 100));
    this.audio.hitSound(grade);

    const info = GRADE[grade];
    n.text?.destroy();
    n.text = undefined;

    const ring = this.add.circle(n.x, n.y, this.level.radius).setStrokeStyle(2, info.color, 1).setDepth(7);
    this.tweens.add({ targets: ring, scale: grade === 'miss' ? 0.8 : 1.45, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

    const label = this.add
      .text(n.x, n.y - this.level.radius - 10, info.text, { fontFamily: SANS, fontSize: '15px', color: info.css })
      .setOrigin(0.5)
      .setDepth(8);
    this.tweens.add({ targets: label, y: label.y - 22, alpha: 0, duration: 650, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
  }

  // ── drawing ───────────────────────────────────────────────

  private draw(t: number, hands: Point[]) {
    const g = this.g;
    g.clear();
    const r = this.level.radius;
    const approach = this.level.approach;

    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      if (n.state !== 'pending') continue;
      const until = n.time - t;
      if (until > approach) continue;

      const fade = Phaser.Math.Clamp((approach - until) / (approach * 0.25), 0, 1);
      g.fillStyle(IVORY, 0.1 * fade).fillCircle(n.x, n.y, r);
      g.lineStyle(3, IVORY, 0.95 * fade).strokeCircle(n.x, n.y, r);
      if (until > 0) g.lineStyle(2, CHAMPAGNE, 0.9 * fade).strokeCircle(n.x, n.y, r * (1 + 2 * (until / approach)));

      if (!n.text) {
        n.text = this.add
          .text(n.x, n.y, String(n.num), { fontFamily: SERIF, fontSize: '34px', color: '#f2efe9' })
          .setOrigin(0.5)
          .setDepth(6);
      }
      n.text.setAlpha(fade);
    }

    // Tracked hands and mouse cursor
    g.lineStyle(2, CHAMPAGNE, 0.95);
    g.fillStyle(CHAMPAGNE, 0.4);
    for (const h of hands) {
      g.strokeCircle(h.x, h.y, 16);
      g.fillCircle(h.x, h.y, 5);
    }
    const pointer = this.input.activePointer;
    if (!pointer.wasTouch && pointer.x > 0) {
      g.fillStyle(IVORY, 0.7).fillCircle(pointer.x, pointer.y, 4);
    }
  }

  private showCountIn(t: number) {
    if (t >= 0) return;
    const beat = 60 / this.level.bpm;
    const k = Math.ceil(-t / beat);
    if (k < 1 || k > LEAD_BEATS || k === this.lastCount) return;
    this.lastCount = k;
    const txt = this.add
      .text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, String(k), { fontFamily: SERIF, fontSize: '140px', color: '#f2efe9' })
      .setOrigin(0.5)
      .setAlpha(0.85)
      .setDepth(9);
    this.tweens.add({ targets: txt, alpha: 0, scale: 1.3, duration: beat * 900, ease: 'Sine.easeOut', onComplete: () => txt.destroy() });
  }

  // ── end ───────────────────────────────────────────────────

  private endGame() {
    if (this.ended) return;
    this.ended = true;
    const result: ResultData = {
      score: this.score,
      reps: this.hits,
      accuracy: this.judged ? Math.round((this.weightSum / this.judged) * 100) : 0,
      timePlayed: Math.round(this.endTime),
      missionsCompleted: 0,
      totalMissions: 0,
      mode: 'Rhythm',
      maxCombo: this.maxCombo,
      judgements: { ...this.counts },
    };
    eventBus.emit(GameEvents.GAME_OVER, result);
    this.scene.start('Result', result);
  }
}
