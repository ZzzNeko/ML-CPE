import { useEffect, useState } from 'react';
import { cameraManager } from '../ai/CameraManager';
import { poseDetector } from '../ai/PoseDetector';
import type { PoseState } from '../ai/poseTypes';

/**
 * Subscribes to the pose detector and keeps it in step with the camera:
 * detection starts when the webcam goes live and stops when it goes away, so
 * the model never runs against a dead stream.
 */
export function usePose(enabled = true) {
  const [state, setState] = useState<PoseState>(() => poseDetector.getState());

  useEffect(() => poseDetector.subscribe(setState), []);

  useEffect(() => {
    if (!enabled) {
      poseDetector.stop();
      return;
    }

    return cameraManager.subscribe((camera) => {
      if (camera.status === 'ready') void poseDetector.start();
      else poseDetector.stop();
    });
  }, [enabled]);

  return {
    ...state,
    framing: state.frame?.framing ?? null,
    landmarks: state.frame?.landmarks ?? null,
    isLoading: state.status === 'loading',
    isRunning: state.status === 'running',
  };
}
