export const GAME_CONFIG = {
  width: 960,
  height: 540,
  backgroundColor: '#0a0a0b',
  targetFps: 30, // pose processing target, section 18
  scoring: {
    baseScorePerRep: 10,
    accuracyBonus: 5,
    comboBonus: 10,
  },
  timeChallengeSeconds: 60,
};

export type GameMode = 'adventure' | 'timeChallenge' | 'rhythm';

// Camera Manager settings (design doc section 8.1, Phase 2).
// Prefer an HD 16:9 feed so the full-screen camera background stays sharp.
// The browser may negotiate a lower native resolution when the camera requires it.
export const CAMERA_CONFIG = {
  width: 1280,
  height: 720,
  frameRate: 30,
  facingMode: 'user' as const,
  /** Selfie view: the player's left hand should appear on the left. */
  mirror: true,
};

// Pose Detector settings (design doc section 9.1, Phase 3).
// The wasm runtime and the .task model are fetched from a CDN on first use;
// point these at /assets/models for a self-hosted build (Phase 10).
export const POSE_CONFIG = {
  wasmPath:
    import.meta.env.VITE_POSE_WASM_PATH ??
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
  modelPath:
    import.meta.env.VITE_POSE_MODEL_PATH ??
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  /** GPU is preferred; PoseDetector retries on CPU if the GPU delegate fails. */
  delegate: 'GPU' as const,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  /** A landmark below this visibility counts as "not seen". */
  visibilityThreshold: 0.5,
  /** EMA weight for the newest frame; lower is smoother but laggier. */
  smoothingAlpha: 0.5,
  /** How close to the edge a landmark may sit before it counts as clipped. */
  frameMargin: 0.02,
  /** Usable head-to-ankle span as a fraction of frame height. */
  bodyHeight: { min: 0.5, max: 0.95 },
  /** Frames of good framing required before Start unlocks (~0.5s at 30fps). */
  readyHoldFrames: 15,
  /** Below this detection rate the UI warns about performance (section 20). */
  lowFpsWarning: 12,
};

/** Pose Rhythm uses the trained eight-class 1D CNN as its only pose classifier. */
export const CNN_CONFIG = {
  enabled: true,
  modelPath: `${import.meta.env.BASE_URL}assets/models/pose-8class/model.json`,
  /** Run the network every N pose frames once the window is full. */
  everyNFrames: 3,
  /** Minimum softmax probability required to accept a predicted pose. */
  minConfidence: 0.2,
};
