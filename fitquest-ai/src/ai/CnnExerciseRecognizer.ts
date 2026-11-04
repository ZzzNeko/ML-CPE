import { CNN_CONFIG } from '../data/gameConfig';
import { CnnModel } from './CnnModel';
import { extractFeatures } from './poseFeatures';
import type { Landmark } from './types';

export interface CnnResult {
  label: string;
  probability: number;
  probabilities: Record<string, number>;
}

/**
 * Sliding window of pose features -> 1D CNN. Loads the eight-class model lazily.
 * If loading fails or the window is not full, predict() returns null; the game
 * does not fall back to geometry or another pose classifier.
 */
export class CnnExerciseRecognizer {
  private model: CnnModel | null = null;
  private loading: Promise<void> | null = null;
  private failed = false;
  private buffer: Float32Array[] = [];
  private frameCount = 0;
  private last: CnnResult | null = null;

  get isUnavailable(): boolean {
    return this.failed;
  }

  /** Number of sampled frames in the temporal CNN window. */
  get windowFrames(): number {
    return this.model?.window ?? 30;
  }

  reset() {
    this.buffer = [];
    this.frameCount = 0;
    this.last = null;
  }

  private ensureLoaded() {
    if (this.model || this.loading || this.failed) return;
    this.loading = CnnModel.load(CNN_CONFIG.modelPath)
      .then((m) => { this.model = m; })
      .catch((err) => { this.failed = true; console.warn('[CNN] model unavailable', err); })
      .finally(() => { this.loading = null; });
  }

  predict(landmarks: Landmark[]): CnnResult | null {
    if (!CNN_CONFIG.enabled || landmarks.length !== 33) return null;
    this.ensureLoaded();
    if (!this.model) return null;

    const { window } = this.model;
    this.buffer.push(extractFeatures(landmarks));
    if (this.buffer.length > window) this.buffer.shift();
    if (this.buffer.length < window) return null;

    this.frameCount += 1;
    if (this.frameCount % CNN_CONFIG.everyNFrames === 0 || !this.last) {
      const probs = this.model.predict(this.buffer);
      let best = 0;
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
      this.last = {
        label: this.model.classes[best],
        probability: probs[best],
        probabilities: Object.fromEntries(this.model.classes.map((label, index) => [label, probs[index]])),
      };
    }
    return this.last;
  }
}
