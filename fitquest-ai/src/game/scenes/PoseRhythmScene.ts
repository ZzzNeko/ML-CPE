import Phaser from 'phaser';
import { poseDetector } from '../../ai/PoseDetector';
import type { PoseFrame } from '../../ai/types';
import { JumpingJackTracker } from '../../ai/JumpingJackTracker';
import { CnnExerciseRecognizer } from '../../ai/CnnExerciseRecognizer';
import { applySkips } from '../../ai/poseCalibration';
import {
  isMotion,
  noteIcon,
  noteLabel,
  POSE_IDS,
  type PoseId,
} from '../../ai/poseTargets';
import { CNN_CONFIG, GAME_CONFIG } from '../../data/gameConfig';
import { applyRenderScale, CHAMPAGNE, DANGER, DIM, IVORY, makeText, SERIF } from '../render';
import { loadSettings } from '../../ui/settings';
import { eventBus, GameEvents } from '../EventBus';
import { LEAD_BEATS } from '../rhythm/beatmap';
import { buildPoseBeatmap, buildPoseBeatmapFromTimeline, POSE_LEVELS, selectVisiblePoseCue, type PoseLevel, type PoseNote } from '../rhythm/poseBeatmap';
import { drawPoseIcon } from '../rhythm/poseIconDraw';
import {
  chainBonus,
  ChainTracker,
  FeverMeter,
  holdGrade,
  isPoseMatch,
  motionGrade,
  multiplier,
  neighbourGap,
  nextMatchStreak,
  notePoints,
  completionGrade,
  perfectChallengeBonus,
  TargetStats,
  WEIGHT,
  windowsForGap,
  type Windows,
} from '../rhythm/poseJudge';
import { COUNT_IN_BEAT_SECONDS, COUNT_IN_GO_SECONDS, COUNT_IN_POST_SECONDS, RhythmAudio, type HitGrade } from '../rhythm/RhythmAudio';
import {
  getYouTubeClock,
  getYouTubeDuration,
  getYouTubeRhythmAnalysis,
  isYouTubeEnded,
  loadBuiltInSong,
  loadYouTubeSong,
  resetYouTubePlayback,
} from '../rhythm/youtubeSong';
import type { BeatAnalysis } from '../rhythm/youtubeBeatDetection';
import { timelineBeatPositions } from '../rhythm/youtubeBeatDetection';
import type { PoseStatRow, ResultData } from './ResultScene';

/** Consecutive pose frames (~30fps) a pose must stay matched, to ignore jitter. */
const STREAK_FRAMES = 3;
/** Pose data older than this (ms) is treated as "no player". */
const STALE_MS = 600;
/**
 * The jumping-jack detector needs about a second of motion before it fires. When
 * it does, the player is credited for up to this many seconds before that (once
 * per move), so starting right on the beat is not punished for the detector's lag.
 */
const MOTION_LAG = 0.8;
const CNN_POSE_CLASSES: Record<PoseId, string> = {
  arms_up: 'arm_raise',
  left_arm_up: 'left_arm_up',
  right_arm_up: 'right_arm_up',
  squat: 'squat',
  knee_left: 'knee_left',
  knee_right: 'knee_right',
};

// Layout (logical 960×540). The player stands in the middle, so the current
// target sits at the left with a single "next" preview beside it; the Audition
// lane runs along the bottom. Score / combo / fever / time live in the React HUD.
const CARD = { x: 150, y: 238, half: 84, icon: 128 };
const BURST = { x: 480, y: 250 };
const NEXT = { x: 348, y: 238, icon: 52, boxW: 128, boxH: 120 };
const LANE = { x: 52, w: 856, y: 446, h: 52 };
/** The lane shows one page at a time: two bars of four beats. */
const PAGE_BEATS = 8;

/** Song length: per difficulty, or VITE_POSE_SONG_SECONDS to shorten it while testing. */
function songSeconds(level: PoseLevel): number {
  const override = Number(import.meta.env.VITE_POSE_SONG_SECONDS);
  return Number.isFinite(override) && override >= 20 ? override : level.seconds;
}

interface LiveNote extends PoseNote {
  state: 'pending' | 'active' | 'done';
  /** Timing grade a hold was started with (its final grade also depends on how long it was kept). */
  timing: HitGrade;
  /** Timing windows for this note (narrower inside a chain). */
  win: Windows;
  /** Seconds of the hold / move spent in the required pose or motion. */
  held: number;
  /** Motion only: was the player moving on the previous frame, and has the lag credit been given. */
  wasOn: boolean;
  lagCredited: boolean;
  result: HitGrade | null;
}

export class PoseRhythmScene extends Phaser.Scene {
  private audio = new RhythmAudio();
  private level!: PoseLevel;
  private beatAnalysis: BeatAnalysis | null = null;
  private beatPositions: number[] = [];
  private notes: LiveNote[] = [];
  private pages = new Map<number, LiveNote[]>();
  private g!: Phaser.GameObjects.Graphics;
  private lastNotes = '';
  private nowLabel!: Phaser.GameObjects.Text;
  private tagLabel!: Phaser.GameObjects.Text;
  private nextTitle!: Phaser.GameObjects.Text;
  private nextLabel!: Phaser.GameObjects.Text;
  private lastHud = '';
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

  private fever = new FeverMeter();
  private chains = new ChainTracker();
  private stats = new TargetStats();
  private chainsTotal = 0;
  private chainsDone = 0;
  private perfectChains = 0;
  private perfectChallenges = 0;

  private thresholds = {} as Record<PoseId, number>;
  private scores = {} as Record<PoseId, number>;
  private streaks = {} as Record<PoseId, number>;
  private jack = new JumpingJackTracker();
  private poseCnn = new CnnExerciseRecognizer();
  private hasMotion = false;
  private lastFrameTs = -1;
  private lastPoseAt = 0;
  private lastPoseFrameAt = -1;
  private poseFrameIntervalMs = 1000 / GAME_CONFIG.targetFps;
  /** Estimated song-time represented by the first positive frame in each CNN match streak. */
  private poseMatchTimes = {} as Record<PoseId, number | null>;
  private beatPhaseNoteId = -1;
  private beatPhase = 0;
  private lastSecond = -1;
  private lastCount = 0;
  private goShown = false;
  private youtubeStarted = false;
  private lastUpdateAt = 0;
  private lastYouTubeRevision = -1;
  /** Latest song-clock position, shared with asynchronous pose inference. */
  private currentSongTime = 0;

  private offPose?: () => void;
  private offQuit?: () => void;

  constructor() {
    super('PoseRhythm');
  }

  create() {
    const selectedSong = loadYouTubeSong();
    this.beatAnalysis = selectedSong ? getYouTubeRhythmAnalysis(selectedSong.videoId) : null;
    const builtInSong = selectedSong ? null : loadBuiltInSong();
    const configuredLevel = POSE_LEVELS[loadSettings().difficulty];
    if (selectedSong) resetYouTubePlayback();
    this.lastYouTubeRevision = getYouTubeClock().revision;
    this.level = {
      ...configuredLevel,
      seconds: selectedSong?.durationSeconds ?? builtInSong?.durationSeconds ?? configuredLevel.seconds,
      bpm: this.beatAnalysis?.segments.length
        ? Math.round(this.beatAnalysis.segments.reduce((sum, segment) => sum + segment.bpm * (segment.endSeconds - segment.startSeconds), 0)
          / this.beatAnalysis.segments.reduce((sum, segment) => sum + segment.endSeconds - segment.startSeconds, 0))
        : selectedSong?.bpm ?? builtInSong?.bpm ?? configuredLevel.bpm,
    };
    const cal = null;
    for (const id of POSE_IDS) this.thresholds[id] = CNN_CONFIG.minConfidence;

    const selectedDuration = selectedSong
      ? (selectedSong.durationSeconds ?? getYouTubeDuration())
      : builtInSong?.durationSeconds ?? 0;
    const map = selectedSong && this.beatAnalysis
      ? buildPoseBeatmapFromTimeline(
        this.level,
        this.beatAnalysis,
        11,
        applySkips(this.level.pool, cal),
        selectedSong.beatOffsetSeconds ?? 0,
      )
      : buildPoseBeatmap(
        this.level,
        selectedDuration > 0 ? selectedDuration : songSeconds(this.level),
        11,
        applySkips(this.level.pool, cal),
        selectedSong?.beatOffsetSeconds ?? 0,
      );
    this.notes = map.notes.map((n, i) => ({
      ...n,
      state: 'pending',
      timing: 'good',
      win: windowsForGap(neighbourGap(map.notes, i)),
      held: 0,
      wasOn: false,
      lagCredited: false,
      result: null,
    }));
    this.endTime = selectedSong && selectedDuration > 0 ? selectedDuration : map.endTime;

    this.beatPositions = this.beatAnalysis ? timelineBeatPositions(this.beatAnalysis.beats) : [];
    const beat = 60 / this.level.bpm;
    this.pages.clear();
    for (const n of this.notes) {
      const position = n.beatIndex ?? n.time / beat;
      const page = Math.floor(position / PAGE_BEATS + 1e-9);
      const list = this.pages.get(page);
      if (list) list.push(n);
      else this.pages.set(page, [n]);
    }
    this.chainsTotal = new Set(this.notes.filter((n) => n.chainId >= 0).map((n) => n.chainId)).size;
    this.hasMotion = this.notes.some((n) => n.kind === 'motion');

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.judged = 0;
    this.weightSum = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.chainsDone = 0;
    this.perfectChains = 0;
    this.perfectChallenges = 0;
    this.fever.reset();
    this.chains.reset();
    this.stats.reset();
    this.jack.reset();
    this.ready = false;
    this.ended = false;
    this.lastSecond = -1;
    this.lastCount = 0;
    this.goShown = false;
    this.youtubeStarted = false;
    this.lastFrameTs = -1;
    this.lastPoseAt = 0;
    this.lastPoseFrameAt = -1;
    this.poseFrameIntervalMs = 1000 / GAME_CONFIG.targetFps;
    this.beatPhaseNoteId = -1;
    this.beatPhase = 0;
    this.lastUpdateAt = 0;
    this.currentSongTime = 0;
    this.resetPoseState();

    applyRenderScale(this);
    this.g = this.add.graphics().setDepth(5);
    this.nowLabel = makeText(this, CARD.x, CARD.y + CARD.half + 46, '', 22, '#f2efe9', { weight: 500 }).setDepth(6);
    this.tagLabel = makeText(this, CARD.x, CARD.y + CARD.half + 74, '', 12, '#cdb892', { weight: 500 }).setDepth(6);
    this.nextTitle = makeText(this, NEXT.x, NEXT.y - NEXT.icon / 2 - 14, 'NEXT', 10, '#b5b0a4', { weight: 500 }).setDepth(6);
    this.nextLabel = makeText(this, NEXT.x, NEXT.y + NEXT.icon / 2 + 20, '', 13, '#d9d5cb').setDepth(6);
    // The React play HUD draws the target card, lane, labels and fever frame now.
    for (const o of [this.g, this.nowLabel, this.tagLabel, this.nextTitle, this.nextLabel]) o.setVisible(false);
    this.lastHud = '';
    this.lastNotes = '';

    eventBus.emit(GameEvents.SCENE_CHANGED, 'PoseRhythm');
    eventBus.emit(GameEvents.SCENE_READY, 'PoseRhythm');
    eventBus.emit(GameEvents.SCORE_UPDATED, 0);
    eventBus.emit(GameEvents.COMBO_UPDATED, 0);
    eventBus.emit(GameEvents.REP_COUNTED, 0);
    eventBus.emit(GameEvents.RHYTHM_ACCURACY, 100);

    this.offPose = poseDetector.subscribe((state) => this.onPose(state.frame));
    this.offQuit = eventBus.on(GameEvents.RHYTHM_QUIT, () => this.scene.start('Menu'));

    this.audio = new RhythmAudio();
    const lastStep = Math.ceil((this.endTime / beat) * 2);
    void this.audio.start(this.level.bpm, LEAD_BEATS, lastStep, !!selectedSong).then(() => {
      this.ready = true;
    }).catch((error: unknown) => {
      console.error('[PoseRhythmScene] audio setup failed; continuing with the performance clock', error);
      this.audio.stop();
      this.ready = true;
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audio.stop();
      this.jack.reset();
      this.poseCnn.reset();
      this.offPose?.();
      this.offQuit?.();
      this.offPose = undefined;
      this.offQuit = undefined;
    });
  }

  update() {
    if (!this.ready || this.ended) return;
    const nowMs = performance.now();
    const dt = this.lastUpdateAt > 0 ? Math.min(0.1, Math.max(0, (nowMs - this.lastUpdateAt) / 1000)) : 0;
    this.lastUpdateAt = nowMs;
    const selectedSong = loadYouTubeSong();
    const ytClock = getYouTubeClock();
    const audioTime = this.audio.songTime();
    if (selectedSong && !this.youtubeStarted && audioTime >= 0) {
      this.youtubeStarted = true;
      window.dispatchEvent(new CustomEvent('fitquest:youtube-start'));
    }
    if (selectedSong && this.youtubeStarted && !ytClock.playing && !isYouTubeEnded()) {
      this.showCountIn(0);
      return;
    }
    if (selectedSong && this.youtubeStarted && ytClock.revision !== this.lastYouTubeRevision) {
      this.lastYouTubeRevision = ytClock.revision;
      this.reconcileNotesAfterSeek(ytClock.time);
    }
    const rawTime = selectedSong ? (this.youtubeStarted ? ytClock.time : Math.min(0, audioTime)) : audioTime;
    const t = selectedSong && isYouTubeEnded() ? this.endTime : rawTime;
    this.currentSongTime = t;

    this.showCountIn(t);
    if (t < 0) return;

    this.judgeNotes(t, dt);
    this.draw(t);

    const remaining = Math.max(0, Math.ceil(this.endTime - t));
    if (remaining !== this.lastSecond) {
      this.lastSecond = remaining;
      eventBus.emit('timer-updated', remaining);
    }
    this.emitHud(t, remaining);
    // The song is the hard end of the round, even if the current pose is unfinished.
    if (t >= this.endTime) this.endGame();
  }

  // ── pose input ────────────────────────────────────────────

  private resetPoseState() {
    for (const id of POSE_IDS) {
      this.scores[id] = 0;
      this.streaks[id] = 0;
      this.poseMatchTimes[id] = null;
    }
  }

  private onPose(frame: PoseFrame | null) {
    if (!frame) {
      this.resetPoseState();
      if (this.hasMotion) this.jack.reset();
      return;
    }
    // The detector also notifies on status/fps changes; only react to new frames.
    if (frame.timestamp === this.lastFrameTs) return;
    this.lastFrameTs = frame.timestamp;
    const decisionAt = performance.now();
    this.lastPoseAt = decisionAt;
    if (this.lastPoseFrameAt > 0) {
      const frameGap = frame.timestamp - this.lastPoseFrameAt;
      if (Number.isFinite(frameGap) && frameGap >= 8 && frameGap <= 150) {
        this.poseFrameIntervalMs = this.poseFrameIntervalMs * 0.8 + frameGap * 0.2;
      }
    }
    this.lastPoseFrameAt = frame.timestamp;

    // The 1D CNN is the only classifier. MediaPipe supplies landmarks only;
    // geometry scores are deliberately not consulted for any target.
    const cnn = this.poseCnn.predict(frame.landmarks);
    // The CNN averages a centred temporal window. Convert the decision back to
    // the window centre and remove measured MediaPipe + CNN processing time.
    const processingLagSec = Math.max(0, performance.now() - frame.timestamp) / 1000;
    const modelWindowLagSec = ((this.poseCnn.windowFrames - 1) * this.poseFrameIntervalMs) / 2000;
    const estimatedPoseTime = this.currentSongTime - processingLagSec - modelWindowLagSec;
    for (const id of POSE_IDS) {
      const className = CNN_POSE_CLASSES[id];
      const probability = className ? cnn?.probabilities[className] : undefined;
      this.scores[id] = probability ?? 0;
      const matched = isPoseMatch(
        0,
        this.thresholds[id],
        probability,
        CNN_CONFIG.minConfidence,
        true,
      );
      const previousStreak = this.streaks[id];
      this.streaks[id] = nextMatchStreak(matched ? 1 : 0, 1, previousStreak);
      if (matched && previousStreak === 0) this.poseMatchTimes[id] = estimatedPoseTime;
      else if (!matched) this.poseMatchTimes[id] = null;
    }
    if (this.hasMotion) this.jack.update(cnn);
  }

  private poseFresh(): boolean {
    return performance.now() - this.lastPoseAt <= STALE_MS;
  }

  private matched(id: PoseId): boolean {
    return this.poseFresh() && this.streaks[id] >= STREAK_FRAMES;
  }

  private moving(): boolean {
    return this.poseFresh() && this.jack.active();
  }

  // ── judging ───────────────────────────────────────────────

  private judgeNotes(t: number, dt: number) {
    // Completion-based flow: only the first unfinished note can be judged.
    // The music keeps playing, but later notes never overtake the current target.
    const current = this.notes.find((note) => note.state !== 'done');
    if (!current) return;
    if (current.kind === 'motion') this.judgeMotion(current, t, dt);
    else this.judgePose(current, t, dt);
  }

  /**
   * The beat decides when a target becomes available, not when it expires.
   * A plain pose is judged as soon as the stable pose detector confirms it;
   * late completions are GOOD rather than MISS. Holds accumulate only the time
   * the correct pose is actually maintained, so releasing pauses their progress.
   */
  private judgePose(n: LiveNote, t: number, dt: number) {
    if (isMotion(n.pose)) return;
    if (n.state === 'pending') {
      // A player may complete early (inside the timing window) or at any time
      // after the target beat. If they do nothing, this note stays the target.
      if (!this.matched(n.pose) || t < n.time - n.win.good) return;
      const firstMatchAt = this.poseMatchTimes[n.pose as PoseId];
      // If the player was already holding the pose before its cue, judge it at
      // the cue itself; otherwise use the latency-corrected CNN window centre.
      const judgedAt = firstMatchAt !== null && firstMatchAt >= n.time - n.win.good
        ? firstMatchAt
        : n.time;
      this.commit(n, completionGrade(judgedAt - n.time, n.win), t);
      // Start the hold clock on the next frame; do not credit time before recognition.
      if (n.kind === 'hold') return;
    }

    if (n.state === 'active' && n.kind === 'hold') {
      this.accrue(n, t, dt, this.matched(n.pose));
      if (n.held >= n.duration) this.finish(n, holdGrade(n.timing, 1), t);
    }
  }

  /** Motion targets remain active until the required amount of movement is detected. */
  private judgeMotion(n: LiveNote, t: number, dt: number) {
    if (n.state === 'pending') {
      if (t < n.time) return;
      n.state = 'active';
    }
    const on = this.moving();
    this.accrue(n, t, dt, on);
    if (on && !n.wasOn && !n.lagCredited) {
      // Credit the detector's known startup latency once, without exceeding the target duration.
      n.lagCredited = true;
      n.held = Math.min(n.duration, n.held + MOTION_LAG);
    }
    n.wasOn = on;
    if (n.held >= n.duration) this.finish(n, motionGrade(1), t);
  }

  /** Accumulate real elapsed time from the moment this target became active. */
  private accrue(n: LiveNote, _t: number, dt: number, on: boolean) {
    if (dt <= 0) return;
    if (on) n.held = Math.min(n.duration, n.held + dt);
  }

  /** A hold begins only after its pose is confirmed; later notes stay queued until it completes. */
  private commit(n: LiveNote, grade: HitGrade, t: number) {
    if (n.kind === 'hold') {
      n.state = 'active';
      n.timing = grade;
      n.held = 0;
      return;
    }
    this.finish(n, grade, t);
  }

  private finish(n: LiveNote, grade: HitGrade, t: number) {
    n.state = 'done';
    n.result = grade;
    this.counts[grade] += 1;
    this.judged += 1;
    this.weightSum += WEIGHT[grade];
    this.stats.add(n.pose, grade);

    const beat = this.beatSecondsAt(t);
    const feverWas = this.fever.active(t);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.hits += 1;
    this.score += notePoints(grade, n.kind, this.combo, feverWas);
    const challengeBonus = n.challenge ? perfectChallengeBonus(grade) : 0;
    if (challengeBonus > 0) {
      this.score += challengeBonus;
      this.perfectChallenges += 1;
      this.popup(`PERFECT CHALLENGE  +${challengeBonus}`);
      this.scoreBurst('#59e8ff', 16);
    }
    const feverStarted = this.fever.add(grade, t, beat);

    const chain = this.chains.add(n, grade);
    if (chain && !chain.broken) {
      const bonus = chainBonus(chain.length, chain.allPerfect, this.combo, feverWas);
      this.score += bonus;
      this.chainsDone += 1;
      if (chain.allPerfect) this.perfectChains += 1;
      this.audio.chainSound(chain.allPerfect);
      this.scoreBurst(chain.allPerfect ? '#f2efe9' : '#cdb892', chain.allPerfect ? 22 : 14);
      this.cameras.main.flash(chain.allPerfect ? 150 : 90, 205, 184, 146, false);
      this.popup(chain.allPerfect ? `PERFECT CHAIN  +${bonus}` : `CHAIN  +${bonus}`, 150, chain.allPerfect ? '#f2efe9' : '#cdb892', chain.allPerfect ? 36 : 30);
    }

    eventBus.emit(GameEvents.SCORE_UPDATED, this.score);
    eventBus.emit(GameEvents.COMBO_UPDATED, this.combo);
    eventBus.emit(GameEvents.REP_COUNTED, this.hits);
    eventBus.emit(GameEvents.RHYTHM_ACCURACY, Math.round((this.weightSum / this.judged) * 100));
    this.audio.hitSound(grade);

    const burstColor = grade === 'perfect' ? '#f2efe9' : '#cdb892';
    this.scoreBurst(burstColor, grade === 'perfect' ? 12 : grade === 'great' ? 8 : 5);
    if (grade === 'perfect') this.cameras.main.flash(75, 242, 239, 233, false);

    if (feverStarted) {
      this.audio.feverSound();
      this.popup('FEVER!', 200, '#cdb892', 64);
    }

    // Grade text / score gain / combo are rendered by the React play HUD. Scoring above is
    // immediate, but the on-screen feedback is snapped to the next half-beat so it lands
    // on the music instead of whenever the pose happened to be recognised.
    const judge = {
      grade,
      gained: notePoints(grade, n.kind, this.combo, feverWas),
      combo: this.combo,
      pose: n.pose,
    };
    const step = beat / 2;
    const wait = Math.max(0, Math.ceil(t / step - 1e-6) * step - t);
    if (wait < 0.02) eventBus.emit(GameEvents.RHYTHM_JUDGE, judge);
    else this.time.delayedCall(wait * 1000, () => eventBus.emit(GameEvents.RHYTHM_JUDGE, judge));

    if (this.combo > 0 && this.combo % 10 === 0) {
      this.popup(`${this.combo} COMBO`, 90, '#cdb892', 54, SERIF, 900);
    }
  }

  /** Small celebratory particles around the target when a pose scores. */
  private scoreBurst(color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const distance = 35 + (i % 3) * 10;
      const dot = this.add.circle(BURST.x, BURST.y, i % 3 === 0 ? 4 : 2.5, Number.parseInt(color.slice(1), 16), 0.95).setDepth(10);
      this.tweens.add({
        targets: dot,
        x: BURST.x + Math.cos(angle) * distance * 3,
        y: BURST.y + Math.sin(angle) * distance * 3,
        scale: 0.2,
        alpha: 0,
        duration: 420 + (i % 3) * 90,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Centre-screen text that grows and fades. */
  private popup(text: string, _y?: number, _color?: string, _size?: number, _font?: string, _ms?: number) {
    eventBus.emit(GameEvents.RHYTHM_POPUP, { text });
  }

  // ── drawing ───────────────────────────────────────────────

  private draw(t: number) {
    const g = this.g;
    g.clear();
    const beat = this.beatSecondsAt(t);
    const approach = beat * this.level.beatsPerPose;
    const feverOn = this.fever.active(t);

    const open = this.notes.filter((n) => n.state !== 'done');
    const current = open[0];
    const next = open[1];
    const nowBeat = this.beatIndexAt(t);
    const frame = (Math.floor(nowBeat) & 1) as 0 | 1;

    if (feverOn) {
      const phase = (((t / beat) % 1) + 1) % 1;
      g.lineStyle(3, CHAMPAGNE, 0.25 + 0.3 * (1 - phase)).strokeRoundedRect(6, 6, GAME_CONFIG.width - 12, GAME_CONFIG.height - 12, 18);
    }

    if (current) this.drawCard(current, t, approach, beat);
    else {
      this.nowLabel.setAlpha(0);
      this.tagLabel.setAlpha(0);
    }

    // One quiet preview of what comes next (the lane below shows the rest).
    if (next) {
      g.fillStyle(0x0a0a0b, 0.4).fillRoundedRect(NEXT.x - NEXT.boxW / 2, NEXT.y - NEXT.boxH / 2 - 4, NEXT.boxW, NEXT.boxH, 12);
      drawPoseIcon(g, noteIcon(next.pose, frame), NEXT.x, NEXT.y, NEXT.icon, IVORY, 0.9, 2.5);
      this.nextTitle.setAlpha(0.85);
      this.nextLabel.setText(noteLabel(next.pose)).setAlpha(1);
    } else {
      this.nextTitle.setAlpha(0);
      this.nextLabel.setAlpha(0);
    }

    // Audition lane: this page with the sweeping cursor.
    const page = Math.max(0, Math.floor(nowBeat / PAGE_BEATS));
    this.drawPage(page, LANE.x, LANE.y, LANE.w, LANE.h, 1, nowBeat, current?.id ?? -1, feverOn);

    this.emitNotes(t, current, next);
  }

  private beatSecondsAt(time: number): number {
    const segments = this.beatAnalysis?.segments;
    if (!segments?.length) return 60 / this.level.bpm;
    const segment = segments.find((item) => time >= item.startSeconds && time < item.endSeconds)
      ?? segments.reduce((closest, item) => {
        const distance = Math.min(Math.abs(time - item.startSeconds), Math.abs(time - item.endSeconds));
        const closestDistance = Math.min(Math.abs(time - closest.startSeconds), Math.abs(time - closest.endSeconds));
        return distance < closestDistance ? item : closest;
      }, segments[0]);
    return segment.beatIntervalSeconds;
  }

  private reconcileNotesAfterSeek(time: number) {
    for (const note of this.notes) {
      if (note.result !== null) continue;
      if (note.time < time - this.beatSecondsAt(time)) {
        note.state = 'done';
        note.held = 0;
      } else if (note.state === 'done' || (note.state === 'active' && time < note.time)) {
        note.state = 'pending';
        note.timing = 'good';
        note.held = 0;
        note.wasOn = false;
        note.lagCredited = false;
      }
    }
    this.resetPoseState();
    this.beatPhaseNoteId = -1;
    this.beatPhase = 0;
    this.lastNotes = '';
  }

  private bpmAt(time: number): number {
    return Math.round(60 / this.beatSecondsAt(time));
  }

  private beatIndexAt(time: number): number {
    const beats = this.beatAnalysis?.beats;
    if (!beats?.length) return time / (60 / this.level.bpm);
    let low = 0, high = beats.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (beats[middle].time <= time) low = middle + 1;
      else high = middle;
    }
    const before = Math.max(0, low - 1);
    if (before >= beats.length - 1) {
      return this.beatPositions[before] + (time - beats[before].time) / beats[before].intervalSeconds;
    }
    if (low === 0) return (time - beats[0].time) / beats[0].intervalSeconds;
    const span = beats[low].time - beats[before].time;
    const progress = span > 0 ? (time - beats[before].time) / span : 0;
    return this.beatPositions[before] + (this.beatPositions[low] - this.beatPositions[before]) * progress;
  }

  /** Tell the React HUD which pose is up, what came before / comes next, and how well it matches. */
  private emitNotes(t: number, current?: LiveNote, next?: LiveNote) {
    const done = this.notes.filter((n) => n.state === 'done');
    const prev = done[done.length - 1];
    const beat = this.beatSecondsAt(t);
    const cueCurrent = selectVisiblePoseCue(this.notes, (note) => note.state === 'done') ?? undefined;
    const cueNext = cueCurrent && cueCurrent !== current
      ? this.notes.find((note) => note.state !== 'done' && note.id > cueCurrent.id)
      : next ?? this.notes.find((note) => note.state !== 'done' && note.id > (cueCurrent?.id ?? -1));
    let match = 0;
    let threshold = 1;
    if (cueCurrent) {
      const motion = isMotion(cueCurrent.pose);
      match = motion ? (this.moving() ? 1 : 0) : this.poseFresh() ? this.scores[cueCurrent.pose as PoseId] : 0;
      threshold = motion ? 0.99 : this.thresholds[cueCurrent.pose as PoseId];
    }
    const m = Math.round(Math.min(1, match) * 20) / 20;
    const until = cueCurrent ? Math.round((cueCurrent.time - t) * 10) / 10 : 0;
    // Capture phase once per target. CSS runs the visible beat flash on the
    // compositor thereafter, so its motion is independent of game/render FPS.
    if (cueCurrent && cueCurrent.id !== this.beatPhaseNoteId) {
      this.beatPhaseNoteId = cueCurrent.id;
      const beatPosition = this.beatIndexAt(t);
      this.beatPhase = ((beatPosition % 1) + 1) % 1;
    }
    const key = `${prev?.id}|${cueCurrent?.id}|${cueNext?.id}|${m}|${until}|${cueCurrent ? this.matched(cueCurrent.pose as PoseId) : 0}`;
    if (key === this.lastNotes) return;
    this.lastNotes = key;
    eventBus.emit(GameEvents.RHYTHM_NOTES, {
      prev: prev ? { id: prev.id, pose: prev.pose } : null,
      current: cueCurrent ? {
        id: cueCurrent.id,
        pose: cueCurrent.pose,
        kind: cueCurrent.kind,
        duration: cueCurrent.duration,
        challenge: cueCurrent.challenge,
      } : null,
      next: cueNext ? { id: cueNext.id, pose: cueNext.pose } : null,
      match: m,
      threshold,
      until,
      beatPhase: cueCurrent ? this.beatPhase : 0,
      bpm: cueCurrent ? Math.round(60 / (cueCurrent.beatSeconds ?? beat)) : this.bpmAt(t),
    });
  }

  private drawCard(current: LiveNote, t: number, approach: number, beat: number) {
    const g = this.g;
    const until = current.time - t;
    const motion = isMotion(current.pose);
    const on = motion ? this.moving() : this.matched(current.pose as PoseId);
    const match = motion
      ? this.poseFresh() ? this.jack.level() : 0
      : this.poseFresh() ? this.scores[current.pose as PoseId] : 0;
    const threshold = motion ? 0.99 : this.thresholds[current.pose as PoseId];
    const { x, y, half } = CARD;
    const accent = on ? CHAMPAGNE : IVORY;

    // Card: dark backing so the icon reads over any camera image
    g.fillStyle(0x0a0a0b, 0.5).fillRoundedRect(x - half, y - half, half * 2, half * 2, 16);
    g.fillStyle(accent, on ? 0.20 : 0.06).fillRoundedRect(x - half, y - half, half * 2, half * 2, 16);
    if (on) {
      const pulse = 1 + (Math.sin(performance.now() / 120) + 1) * 0.025;
      const glow = half * pulse;
      g.lineStyle(3, CHAMPAGNE, 0.18 + (Math.sin(performance.now() / 120) + 1) * 0.10)
        .strokeRoundedRect(x - glow, y - glow, glow * 2, glow * 2, 18);
    }
    g.lineStyle(2.5, accent, 0.95).strokeRoundedRect(x - half, y - half, half * 2, half * 2, 16);
    const frame = (Math.floor(this.beatIndexAt(t)) & 1) as 0 | 1;
    drawPoseIcon(g, noteIcon(current.pose, frame), x, y, CARD.icon, accent, 1, 5);

    // Timing cue: a frame that closes onto the card as the beat arrives…
    if (until > 0 && until <= approach) {
      const k = until / approach;
      const h = half + half * 0.7 * k;
      g.lineStyle(2.5, CHAMPAGNE, 0.3 + 0.6 * (1 - k)).strokeRoundedRect(x - h, y - h, h * 2, h * 2, 16 + 10 * k);
    }
    // …then, for holds and moves, a ring that fills while the pose is kept (red where it was dropped)
    if (current.duration > 0 && (current.state === 'active' || current.kind === 'motion')) {
      const k = Math.min(1, current.held / current.duration);
      g.lineStyle(4, on ? CHAMPAGNE : DANGER, 0.95);
      g.beginPath();
      g.arc(x, y, half + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
      g.strokePath();
    }

    // Live match meter, snug under the card, with the pass mark
    const bw = half * 2;
    const bx = x - half;
    const by = y + half + 14;
    g.fillStyle(IVORY, 0.16).fillRoundedRect(bx, by, bw, 6, 3);
    g.fillStyle(accent, 0.95).fillRoundedRect(bx, by, Math.max(4, bw * match), 6, 3);
    if (!motion) g.fillStyle(IVORY, 0.85).fillRect(bx + bw * threshold - 1, by - 3, 2, 12);

    this.nowLabel.setText(noteLabel(current.pose)).setAlpha(1);
    let tag = '';
    const bpm = this.bpmAt(t);
    if (current.chainLength > 1) tag = `CHAIN ${current.chainIndex + 1}/${current.chainLength} · TEMPO ${bpm}`;
    else if (current.kind === 'hold') tag = `HOLD ${Math.round(current.duration / beat)} BEATS · MUSIC ${bpm} BPM`;
    else if (current.kind === 'motion') tag = `KEEP MOVING ${Math.round(current.duration / beat)} BEATS · MUSIC ${bpm} BPM`;
    else tag = `MUSIC ${bpm} BPM · ท่าถูกต้องสำคัญกว่าจังหวะเป๊ะ`;
    this.tagLabel.setText(tag).setAlpha(tag ? 1 : 0);
  }

  /** Push score / combo / fever / time to the React HUD, only when something visible changed. */
  private emitHud(t: number, remaining: number) {
    const on = this.fever.active(t);
    const progress = Math.round(this.fever.progress(t) * 50) / 50;
    const mult = Math.round(multiplier(this.combo, on) * 10) / 10;
    const bpm = this.bpmAt(t);
    const key = `${this.score}|${this.combo}|${progress}|${on}|${mult}|${remaining}|${bpm}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    eventBus.emit(GameEvents.RHYTHM_HUD, {
      score: this.score,
      combo: this.combo,
      fever: progress,
      feverOn: on,
      mult,
      remaining,
      total: Math.round(this.endTime),
      bpm,
    });
  }

  /**
   * One page of the Audition bar: beats as ticks, notes as icon chips placed by
   * time, chains linked, holds / moves as bars. `nowBeat` (current page only)
   * adds the sweeping cursor.
   */
  private drawPage(
    page: number,
    x: number,
    y: number,
    w: number,
    h: number,
    alpha: number,
    nowBeat: number | null,
    currentId: number,
    feverOn: boolean,
  ) {
    const g = this.g;
    const beat = this.beatSecondsAt(page * PAGE_BEATS * 60 / this.level.bpm);
    const cy = y + h / 2;
    // Inset so chips at the page edges stay inside the box.
    const pad = h * 0.62;
    const bx = (beatPos: number) => x + pad + ((w - pad * 2) * beatPos) / PAGE_BEATS;

    g.fillStyle(0x0a0a0b, 0.45 * alpha).fillRoundedRect(x - 10, y - 8, w + 20, h + 16, 10);
    g.lineStyle(feverOn ? 2 : 1, feverOn ? CHAMPAGNE : IVORY, (feverOn ? 0.8 : 0.22) * alpha)
      .strokeRoundedRect(x - 10, y - 8, w + 20, h + 16, 10);

    for (let b = 0; b <= PAGE_BEATS; b++) {
      const tx = bx(b);
      const tall = b % 4 === 0;
      g.lineStyle(1, IVORY, (tall ? 0.4 : 0.18) * alpha);
      g.beginPath();
      g.moveTo(tx, y + h * (tall ? 0.7 : 0.82));
      g.lineTo(tx, y + h);
      g.strokePath();
    }

    const frame = (Math.floor((nowBeat ?? 0)) & 1) as 0 | 1;
    let prevChain: { id: number; x: number } | null = null;
    for (const n of this.pages.get(page) ?? []) {
      const start = (n.beatIndex ?? n.time / beat) - page * PAGE_BEATS;
      const nx = bx(start);
      const { color, alpha: ca } = this.chipColor(n);

      if (n.duration > 0) {
        const end = Math.min(PAGE_BEATS, start + n.duration / (n.beatSeconds ?? beat));
        const ex = bx(end);
        const bh = h * 0.28;
        g.fillStyle(color, 0.22 * alpha).fillRoundedRect(nx, cy - bh / 2, Math.max(4, ex - nx), bh, 4);
        const fill = n.state === 'done' ? (n.result === 'miss' ? 0 : 1) : Math.min(1, n.duration > 0 ? n.held / n.duration : 0);
        if (fill > 0) g.fillStyle(color, 0.75 * alpha).fillRoundedRect(nx, cy - bh / 2, Math.max(4, (ex - nx) * fill), bh, 4);
      }

      if (n.chainLength > 1) {
        if (prevChain && prevChain.id === n.chainId) {
          g.lineStyle(2, CHAMPAGNE, 0.7 * alpha);
          g.beginPath();
          g.moveTo(prevChain.x, cy);
          g.lineTo(nx, cy);
          g.strokePath();
        }
        prevChain = { id: n.chainId, x: nx };
      }

      const r = h * 0.52;
      g.fillStyle(0x0a0a0b, 0.6 * alpha).fillCircle(nx, cy, r);
      if (n.id === currentId) g.lineStyle(2, CHAMPAGNE, 0.95 * alpha).strokeCircle(nx, cy, r + 1);
      drawPoseIcon(g, noteIcon(n.pose, frame), nx, cy, h * 0.95, color, ca * alpha, Math.max(1.5, h / 16));
    }

    if (nowBeat !== null) {
      const k = Math.min(1, Math.max(0, (nowBeat - page * PAGE_BEATS) / PAGE_BEATS));
      const cx = bx(k * PAGE_BEATS);
      g.fillStyle(CHAMPAGNE, 0.08).fillRect(x, y - 4, cx - x, h + 8);
      g.fillStyle(CHAMPAGNE, 0.95).fillRect(cx - 1, y - 8, 2, h + 16);
      g.fillTriangle(cx - 5, y - 14, cx + 5, y - 14, cx, y - 6);
    }
  }

  private chipColor(n: LiveNote): { color: number; alpha: number } {
    switch (n.result) {
      case 'perfect': return { color: CHAMPAGNE, alpha: 1 };
      case 'great': return { color: CHAMPAGNE, alpha: 0.65 };
      case 'good': return { color: DIM, alpha: 0.85 };
      case 'miss': return { color: DANGER, alpha: 0.85 };
      default: return { color: IVORY, alpha: 0.9 };
    }
  }

  /** The count-in is drawn by the React play HUD (neon theme); the scene only reports the beat. */
  private showCountIn(t: number) {
    if (t >= -COUNT_IN_GO_SECONDS && t < 0) {
      if (!this.goShown && this.lastCount > 0) {
        this.goShown = true;
        eventBus.emit(GameEvents.RHYTHM_COUNT, { n: 0, beat: COUNT_IN_GO_SECONDS });
      }
      return;
    }
    if (t >= 0) return;
    const k = Math.ceil((-t - COUNT_IN_POST_SECONDS) / COUNT_IN_BEAT_SECONDS);
    if (k < 1 || k > LEAD_BEATS || k === this.lastCount) return;
    this.lastCount = k;
    eventBus.emit(GameEvents.RHYTHM_COUNT, { n: k, beat: COUNT_IN_BEAT_SECONDS });
  }

  // ── end ───────────────────────────────────────────────────

  private endGame() {
    if (this.ended) return;
    this.ended = true;
    const poseStats: PoseStatRow[] = this.stats.list().map((s) => ({
      id: s.target,
      label: noteLabel(s.target),
      total: s.total,
      accuracy: s.accuracy,
      perfect: s.counts.perfect,
      miss: s.counts.miss,
    }));
    const result: ResultData = {
      score: this.score,
      reps: this.hits,
      accuracy: this.judged ? Math.round((this.weightSum / this.judged) * 100) : 0,
      timePlayed: Math.round(this.endTime),
      missionsCompleted: 0,
      totalMissions: 0,
      mode: 'PoseRhythm',
      maxCombo: this.maxCombo,
      judgements: { ...this.counts },
      poseStats,
      chains: { completed: this.chainsDone, total: this.chainsTotal, perfect: this.perfectChains },
      fevers: this.fever.starts,
      perfectChallenges: this.perfectChallenges,
    };
    eventBus.emit(GameEvents.GAME_OVER, result);
    this.scene.start('Result', result);
  }
}
