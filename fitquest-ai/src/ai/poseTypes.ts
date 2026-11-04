import type { Landmark } from './types';

export type PoseStatus =
  | 'idle' // detector not started
  | 'loading' // fetching wasm + model
  | 'running' // detecting each frame
  | 'error';

export interface PoseError {
  message: string;
  hint: string;
}

/** How the player is positioned relative to the camera. */
export type FramingDistance = 'ok' | 'too-close' | 'too-far' | 'unknown';

export interface FramingReport {
  /** Every key body part is visible and inside the frame at a usable distance. */
  ready: boolean;
  bodyDetected: boolean;
  /** Parts the model cannot see well enough, e.g. ['feet']. */
  missingParts: string[];
  /** Parts that are visible but touching the edge of the frame. */
  outOfFrameParts: string[];
  distance: FramingDistance;
  /** Head-to-ankle height as a fraction of frame height. */
  bodyHeightRatio: number;
  /** Mean visibility across key landmarks, 0–1. */
  confidence: number;
  /** One line of guidance for the player. */
  message: string;
}

export interface PoseFrame {
  /** 33 smoothed landmarks in normalized image space (x, y in 0–1). */
  landmarks: Landmark[];
  /** Metric-ish coordinates from the model, kept for Phase 5 features. */
  worldLandmarks: Landmark[];
  framing: FramingReport;
  timestamp: number;
}

export interface PoseState {
  status: PoseStatus;
  /** Delegate used by the loaded MediaPipe model, if available. */
  delegate: 'GPU' | 'CPU' | null;
  error: PoseError | null;
  /** Latest processed frame, or null before the first detection. */
  frame: PoseFrame | null;
  /** Measured detection rate, for the low-FPS warning in section 20. */
  fps: number;
  /** True once framing has been good for a short, stable stretch. */
  readyToStart: boolean;
}

export type PoseListener = (state: PoseState) => void;
