// Shared types for the AI pipeline described in sections 7-9 of the design doc.
// Implemented starting Phase 2 (Camera) / Phase 3 (Pose Estimation).

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type PoseLandmarks = Landmark[]; // 33 points, MediaPipe Pose Landmarker order

export interface ExercisePrediction {
  classId: number;
  className: string;
  confidence: number;
  direction?: 'left' | 'right';
}

export interface FeatureVector {
  values: number[];
  featureNames: string[];
}

// Camera layer (Phase 2) — see ./cameraTypes.ts
export type {
  CameraStatus,
  CameraErrorCode,
  CameraError,
  CameraDevice,
  CameraResolution,
  CameraState,
  CameraListener,
} from './cameraTypes';

// Pose layer (Phase 3) — see ./poseTypes.ts
export type {
  PoseStatus,
  PoseError,
  FramingDistance,
  FramingReport,
  PoseFrame,
  PoseState,
  PoseListener,
} from './poseTypes';
