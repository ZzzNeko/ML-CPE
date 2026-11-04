import type { Landmark } from '../ai/types';

/**
 * Exponential moving average over landmark positions (design doc section 20:
 * "ใช้ Smoothing เพื่อลด Jitter"). Cheap enough to run every frame and enough
 * to stop the skeleton shimmering while the player stands still.
 *
 * `alpha` is the weight of the newest frame: 1 = no smoothing, 0.2 = heavy.
 */
export class LandmarkSmoother {
  private previous: Landmark[] | null = null;
  private alpha: number;

  constructor(alpha: number) {
    this.alpha = alpha;
  }

  reset() {
    this.previous = null;
  }

  apply(landmarks: Landmark[]): Landmark[] {
    const prev = this.previous;
    if (!prev || prev.length !== landmarks.length) {
      this.previous = landmarks;
      return landmarks;
    }

    const a = this.alpha;
    const smoothed = landmarks.map((point, i) => {
      const last = prev[i];
      return {
        x: last.x + (point.x - last.x) * a,
        y: last.y + (point.y - last.y) * a,
        z: last.z + (point.z - last.z) * a,
        // Visibility is a confidence, not a position — smooth it more gently so
        // a single bad frame doesn't drop a body part out of the framing check.
        visibility: last.visibility + (point.visibility - last.visibility) * a * 0.5,
      };
    });

    this.previous = smoothed;
    return smoothed;
  }
}

/** Running average of the last `size` samples, used for the FPS readout. */
export class RollingAverage {
  private samples: number[] = [];
  private size: number;

  constructor(size: number) {
    this.size = size;
  }

  push(value: number): number {
    this.samples.push(value);
    if (this.samples.length > this.size) this.samples.shift();
    return this.value;
  }

  get value(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  reset() {
    this.samples = [];
  }
}
