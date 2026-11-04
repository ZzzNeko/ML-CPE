/**
 * MediaPipe Pose Landmarker index map (design doc section 9.1).
 * The model returns 33 points; these are the ones the game cares about.
 */
export const POSE_LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const LANDMARK_COUNT = 33;

/**
 * Body parts checked before play starts. Grouped so the calibration screen can
 * say "your feet are out of frame" instead of "landmark 28 is missing".
 */
export const BODY_PARTS: { label: string; indices: number[] }[] = [
  { label: 'head', indices: [POSE_LANDMARK.NOSE] },
  {
    label: 'shoulders',
    indices: [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.RIGHT_SHOULDER],
  },
  {
    label: 'hands',
    indices: [POSE_LANDMARK.LEFT_WRIST, POSE_LANDMARK.RIGHT_WRIST],
  },
  { label: 'hips', indices: [POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.RIGHT_HIP] },
  { label: 'knees', indices: [POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.RIGHT_KNEE] },
  { label: 'feet', indices: [POSE_LANDMARK.LEFT_ANKLE, POSE_LANDMARK.RIGHT_ANKLE] },
];

/** Every landmark the exercise features (Phase 5) will be built from. */
export const KEY_LANDMARKS: number[] = BODY_PARTS.flatMap((p) => p.indices).concat([
  POSE_LANDMARK.LEFT_ELBOW,
  POSE_LANDMARK.RIGHT_ELBOW,
]);

/** Skeleton edges drawn on the overlay. */
export const SKELETON_CONNECTIONS: [number, number][] = [
  // arms
  [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.LEFT_ELBOW],
  [POSE_LANDMARK.LEFT_ELBOW, POSE_LANDMARK.LEFT_WRIST],
  [POSE_LANDMARK.RIGHT_SHOULDER, POSE_LANDMARK.RIGHT_ELBOW],
  [POSE_LANDMARK.RIGHT_ELBOW, POSE_LANDMARK.RIGHT_WRIST],
  // torso
  [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.RIGHT_SHOULDER],
  [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.LEFT_HIP],
  [POSE_LANDMARK.RIGHT_SHOULDER, POSE_LANDMARK.RIGHT_HIP],
  [POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.RIGHT_HIP],
  // legs
  [POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.LEFT_KNEE],
  [POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.LEFT_ANKLE],
  [POSE_LANDMARK.LEFT_ANKLE, POSE_LANDMARK.LEFT_FOOT_INDEX],
  [POSE_LANDMARK.RIGHT_HIP, POSE_LANDMARK.RIGHT_KNEE],
  [POSE_LANDMARK.RIGHT_KNEE, POSE_LANDMARK.RIGHT_ANKLE],
  [POSE_LANDMARK.RIGHT_ANKLE, POSE_LANDMARK.RIGHT_FOOT_INDEX],
  // face anchor
  [POSE_LANDMARK.NOSE, POSE_LANDMARK.LEFT_SHOULDER],
  [POSE_LANDMARK.NOSE, POSE_LANDMARK.RIGHT_SHOULDER],
];

/** Joints drawn as dots — the rest of the 33 add clutter without meaning. */
export const DRAWN_JOINTS: number[] = Array.from(
  new Set(SKELETON_CONNECTIONS.flat()),
);
