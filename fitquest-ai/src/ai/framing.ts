import { POSE_CONFIG } from '../data/gameConfig';
import { BODY_PARTS, KEY_LANDMARKS, POSE_LANDMARK } from './landmarks';
import type { FramingDistance, FramingReport } from './poseTypes';
import type { Landmark } from './types';
import { meanVisibility } from '../utils/math';

const EMPTY: FramingReport = {
  ready: false,
  bodyDetected: false,
  missingParts: [],
  outOfFrameParts: [],
  distance: 'unknown',
  bodyHeightRatio: 0,
  confidence: 0,
  message: 'Step into view so the camera can see you.',
};

export function emptyFraming(): FramingReport {
  return EMPTY;
}

/**
 * "Is the player usable?" check (design doc section 8.1 + Phase 3 goals:
 * ตรวจสอบ Visibility / ตรวจสอบว่าร่างกายอยู่ในกรอบ).
 *
 * Runs on smoothed landmarks so a single noisy frame doesn't flip the verdict.
 */
export function analyzeFraming(landmarks: Landmark[] | null): FramingReport {
  if (!landmarks || landmarks.length === 0) return EMPTY;

  const { visibilityThreshold, frameMargin, bodyHeight } = POSE_CONFIG;

  const missingParts: string[] = [];
  const outOfFrameParts: string[] = [];

  for (const part of BODY_PARTS) {
    const visible = part.indices.filter(
      (i) => (landmarks[i]?.visibility ?? 0) >= visibilityThreshold,
    );

    if (visible.length === 0) {
      missingParts.push(part.label);
      continue;
    }

    const clipped = visible.some((i) => {
      const p = landmarks[i];
      return (
        p.x < frameMargin ||
        p.x > 1 - frameMargin ||
        p.y < frameMargin ||
        p.y > 1 - frameMargin
      );
    });
    if (clipped) outOfFrameParts.push(part.label);
  }

  const confidence = meanVisibility(landmarks, KEY_LANDMARKS);
  const bodyHeightRatio = measureBodyHeight(landmarks, visibilityThreshold);
  const distance = judgeDistance(bodyHeightRatio, bodyHeight);

  const ready =
    missingParts.length === 0 && outOfFrameParts.length === 0 && distance === 'ok';

  return {
    ready,
    bodyDetected: true,
    missingParts,
    outOfFrameParts,
    distance,
    bodyHeightRatio,
    confidence,
    message: buildMessage(missingParts, outOfFrameParts, distance),
  };
}

/** Head-to-ankle span as a fraction of the frame; 0 when either end is unseen. */
function measureBodyHeight(landmarks: Landmark[], threshold: number): number {
  const head = landmarks[POSE_LANDMARK.NOSE];
  const ankles = [landmarks[POSE_LANDMARK.LEFT_ANKLE], landmarks[POSE_LANDMARK.RIGHT_ANKLE]]
    .filter((p) => (p?.visibility ?? 0) >= threshold);

  if (!head || head.visibility < threshold || ankles.length === 0) return 0;

  const lowest = Math.max(...ankles.map((a) => a.y));
  return Math.max(0, lowest - head.y);
}

function judgeDistance(
  ratio: number,
  bounds: { min: number; max: number },
): FramingDistance {
  if (ratio <= 0) return 'unknown';
  if (ratio > bounds.max) return 'too-close';
  if (ratio < bounds.min) return 'too-far';
  return 'ok';
}

function buildMessage(
  missing: string[],
  outOfFrame: string[],
  distance: FramingDistance,
): string {
  if (missing.length > 0) {
    return `The camera cannot see your ${list(missing)}. Step back or move into the light.`;
  }
  if (outOfFrame.length > 0) {
    return `Your ${list(outOfFrame)} ${outOfFrame.length > 1 ? 'are' : 'is'} at the edge of the frame.`;
  }
  if (distance === 'too-close') return 'Step back so your whole body fits in the frame.';
  if (distance === 'too-far') return 'Step closer — you are too small in the frame to track.';
  if (distance === 'unknown') return 'Stand facing the camera with your feet in view.';
  return 'Good position — hold still for a moment.';
}

function list(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
