import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraManager } from '../ai/CameraManager';
import type { CameraState } from '../ai/cameraTypes';
import { eventBus, GameEvents } from '../game/EventBus';

/**
 * Subscribes React to the shared CameraManager and mirrors every change onto
 * the event bus so Phaser scenes can react too (e.g. pausing when the camera
 * drops out mid-game).
 */
export function useCamera() {
  const [state, setState] = useState<CameraState>(() => cameraManager.getState());

  useEffect(() => {
    return cameraManager.subscribe((next) => {
      setState(next);
      eventBus.emit(GameEvents.CAMERA_STATE, next);
    });
  }, []);

  const start = useCallback((deviceId?: string) => cameraManager.start(deviceId), []);
  const stop = useCallback(() => cameraManager.stop(), []);
  const reset = useCallback(() => cameraManager.reset(), []);
  const switchDevice = useCallback((id: string) => cameraManager.switchDevice(id), []);

  return {
    ...state,
    isReady: state.status === 'ready',
    isBusy: state.status === 'requesting',
    start,
    stop,
    reset,
    switchDevice,
  };
}

/**
 * Attaches the shared manager stream to the single game-background <video>.
 */
export function useCameraVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const apply = () => {
      const video = ref.current;
      if (!video) return;
      const stream = cameraManager.getStream();
      if (video.srcObject === stream) return;
      video.srcObject = stream;
      if (stream) void video.play().catch(() => {});
    };

    apply();
    return cameraManager.subscribe(apply);
  }, []);

  return ref;
}
