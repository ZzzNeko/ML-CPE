// Types for the Camera Manager (design doc section 8.1, Phase 2).

export type CameraStatus =
  | 'idle' // nothing requested yet, or the player stopped the camera
  | 'requesting' // waiting on getUserMedia / the browser permission prompt
  | 'ready' // stream is live and playing
  | 'error'; // see CameraState.error

export type CameraErrorCode =
  | 'unsupported' // browser has no getUserMedia
  | 'insecure-context' // not https:// or localhost
  | 'permission-denied' // player (or browser policy) blocked access
  | 'no-camera' // no video input device found
  | 'camera-busy' // device exists but another app holds it
  | 'constraints' // requested resolution/device not available
  | 'disconnected' // camera was unplugged or the track ended
  | 'unknown';

export interface CameraError {
  code: CameraErrorCode;
  /** Shown to the player: what happened. */
  message: string;
  /** Shown to the player: what to do about it. */
  hint: string;
  /** Whether retrying without changing anything could plausibly work. */
  recoverable: boolean;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface CameraResolution {
  width: number;
  height: number;
  frameRate: number;
}

export interface CameraState {
  status: CameraStatus;
  error: CameraError | null;
  devices: CameraDevice[];
  activeDeviceId: string | null;
  resolution: CameraResolution | null;
}

export type CameraListener = (state: CameraState) => void;
