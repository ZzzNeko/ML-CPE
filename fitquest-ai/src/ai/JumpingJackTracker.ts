import { CNN_CONFIG } from '../data/gameConfig';
import type { CnnResult } from './CnnExerciseRecognizer';

/**
 * Motion judgement for Pose Rhythm. The 1D CNN is the sole source of the
 * jumping_jack decision; no geometric phase counter or arm-motion fallback.
 */
export class JumpingJackTracker {
  private confidence = 0;

  reset() {
    this.confidence = 0;
  }

  /** Reuse the current frame's CNN prediction; do not run a second model. */
  update(result: CnnResult | null) {
    this.confidence = result?.label === 'jumping_jack' ? result.probability : 0;
  }

  /** True only when the CNN predicts jumping_jack above the configured threshold. */
  active(): boolean {
    return this.confidence >= CNN_CONFIG.minConfidence;
  }

  /** 0–1 CNN confidence for the live meter. */
  level(): number {
    return this.confidence;
  }
}
