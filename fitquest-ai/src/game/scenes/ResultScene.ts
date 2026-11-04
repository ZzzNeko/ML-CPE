import Phaser from 'phaser';
import { eventBus, GameEvents } from '../EventBus';
import { applyRenderScale } from '../render';

/** Accuracy for one pose / move over a Pose Rhythm song. */
export interface PoseStatRow {
  id: string;
  label: string;
  total: number;
  /** 0–100, weighted by grade (perfect 1 · great .66 · good .33). */
  accuracy: number;
  perfect: number;
  miss: number;
}

export interface ResultData {
  score: number;
  reps: number;
  accuracy: number;
  timePlayed: number;
  missionsCompleted: number;
  totalMissions: number;
  /** Set by the rhythm modes; the result screen and Play again use it. */
  mode?: 'Rhythm' | 'PoseRhythm';
  maxCombo?: number;
  judgements?: { perfect: number; great: number; good: number; miss: number };
  /** Pose Rhythm only: weakest pose first. */
  poseStats?: PoseStatRow[];
  chains?: { completed: number; total: number; perfect: number };
  fevers?: number;
  perfectChallenges?: number;
}

export class ResultScene extends Phaser.Scene {
  private offRestart?: () => void;
  private offMenu?: () => void;

  constructor() {
    super('Result');
  }

  create(data: ResultData) {
    const result = {
      score: data?.score ?? 0,
      reps: data?.reps ?? 0,
      accuracy: data?.accuracy ?? 0,
      timePlayed: data?.timePlayed ?? 0,
      missionsCompleted: data?.missionsCompleted ?? 0,
      totalMissions: data?.totalMissions ?? 0,
      mode: data?.mode,
      maxCombo: data?.maxCombo,
      judgements: data?.judgements,
      poseStats: data?.poseStats,
      chains: data?.chains,
      fevers: data?.fevers,
      perfectChallenges: data?.perfectChallenges,
    };

    eventBus.emit(GameEvents.SCENE_CHANGED, 'Result');
    eventBus.emit(GameEvents.RESULT_READY, result);

    // No backdrop here: the React result panel (neon theme) blurs the camera feed behind it.
    applyRenderScale(this);

    this.offRestart = eventBus.on(GameEvents.RESULT_RESTART, () => this.scene.start(result.mode ?? 'PoseRhythm'));
    this.offMenu = eventBus.on(GameEvents.RESULT_MENU, () => this.scene.start('Menu'));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offRestart?.();
      this.offMenu?.();
      this.offRestart = undefined;
      this.offMenu = undefined;
    });
  }
}
