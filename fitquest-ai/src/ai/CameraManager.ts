import { CAMERA_CONFIG } from '../data/gameConfig';
import type {
  CameraDevice,
  CameraError,
  CameraListener,
  CameraState,
} from './cameraTypes';

/**
 * Camera Manager — design doc section 8.1.
 *
 * Owns the single MediaStream for the whole app: asks for permission, starts
 * and stops the webcam, tracks device list and errors, and exposes a hidden
 * <video> element that Phase 3's PoseDetector will read frames from.
 *
 * Deliberately framework-free (no React, no Phaser). UI layers subscribe via
 * `subscribe()`; `useCamera()` bridges it into React.
 */
class CameraManager {
  private stream: MediaStream | null = null;
  private sourceVideo: HTMLVideoElement | null = null;
  private listeners = new Set<CameraListener>();
  private startPromise: Promise<boolean> | null = null;

  private state: CameraState = {
    status: 'idle',
    error: null,
    devices: [],
    activeDeviceId: null,
    resolution: null,
  };

  // ---------------------------------------------------------------- state

  getState(): CameraState {
    return this.state;
  }

  isReady(): boolean {
    return this.state.status === 'ready' && this.stream !== null;
  }

  subscribe(listener: CameraListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<CameraState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  // --------------------------------------------------------------- stream

  /** The live stream, or null. UI <video> elements attach to this. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Hidden video element carrying the stream. Phase 3 passes this straight to
   * MediaPipe's `detectForVideo()`, so pose detection never depends on a
   * particular UI component being mounted.
   */
  getFrameSource(): HTMLVideoElement | null {
    return this.isReady() ? this.sourceVideo : null;
  }

  // -------------------------------------------------------------- actions

  /**
   * Request permission (if not already granted) and start the webcam.
   * Safe to call repeatedly — concurrent calls share one request, and calling
   * it while already running is a no-op unless `deviceId` differs.
   */
  async start(deviceId?: string): Promise<boolean> {
    if (this.isReady() && (!deviceId || deviceId === this.state.activeDeviceId)) {
      return true;
    }
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.openStream(deviceId).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async openStream(deviceId?: string): Promise<boolean> {
    const blocked = this.checkSupport();
    if (blocked) {
      this.fail(blocked);
      return false;
    }

    // Switching devices: release the current one first so it isn't reported busy.
    this.releaseStream();
    this.setState({ status: 'requesting', error: null });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: CAMERA_CONFIG.width },
          height: { ideal: CAMERA_CONFIG.height },
          frameRate: { ideal: CAMERA_CONFIG.frameRate },
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: CAMERA_CONFIG.facingMode }),
        },
      });

      this.stream = stream;
      this.watchTracks(stream);
      await this.playInSourceVideo(stream);

      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};

      this.setState({
        status: 'ready',
        error: null,
        activeDeviceId: settings.deviceId ?? deviceId ?? null,
        resolution: {
          width: settings.width ?? CAMERA_CONFIG.width,
          height: settings.height ?? CAMERA_CONFIG.height,
          frameRate: Math.round(settings.frameRate ?? CAMERA_CONFIG.frameRate),
        },
      });

      // Labels are only readable once permission is granted, so refresh now.
      void this.refreshDevices();
      return true;
    } catch (err) {
      this.releaseStream();
      this.fail(describeError(err));
      return false;
    }
  }

  /** Stop the webcam and release the device (camera light goes off). */
  stop() {
    this.releaseStream();
    this.setState({ status: 'idle', error: null, resolution: null });
  }

  /** Clear an error so the UI can show the pre-permission state again. */
  reset() {
    if (this.state.status === 'error') {
      this.setState({ status: 'idle', error: null });
    }
  }

  async switchDevice(deviceId: string): Promise<boolean> {
    return this.start(deviceId);
  }

  /** Enumerate video inputs. Labels are empty until permission is granted. */
  async refreshDevices(): Promise<CameraDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const devices = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
      this.setState({ devices });
      return devices;
    } catch {
      return [];
    }
  }

  /**
   * Has the player already granted camera access in a previous session?
   * Returns null where the Permissions API isn't available (Safari).
   */
  async getPermissionState(): Promise<PermissionState | null> {
    if (!navigator.permissions?.query) return null;
    try {
      const status = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      return status.state;
    } catch {
      return null;
    }
  }

  /** Release everything — call on app teardown (design doc section 20). */
  dispose() {
    this.releaseStream();
    this.listeners.clear();
    this.state = {
      status: 'idle',
      error: null,
      devices: [],
      activeDeviceId: null,
      resolution: null,
    };
  }

  // -------------------------------------------------------------- internals

  private checkSupport(): CameraError | null {
    if (typeof window === 'undefined') return null;

    if (!window.isSecureContext) {
      return {
        code: 'insecure-context',
        message: 'Browsers only allow camera access on a secure connection.',
        hint: 'Open the game over https:// or on localhost.',
        recoverable: false,
      };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        code: 'unsupported',
        message: 'This browser cannot open a webcam.',
        hint: 'Use a recent version of Chrome, Edge, Firefox or Safari.',
        recoverable: false,
      };
    }
    return null;
  }

  private fail(error: CameraError) {
    this.setState({ status: 'error', error, resolution: null });
  }

  private watchTracks(stream: MediaStream) {
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        // Fires when the camera is unplugged or taken over by the OS.
        if (this.stream !== stream) return;
        this.releaseStream();
        this.fail({
          code: 'disconnected',
          message: 'The camera stopped sending video.',
          hint: 'Check that it is still plugged in, then start it again.',
          recoverable: true,
        });
      });
    });
  }

  private async playInSourceVideo(stream: MediaStream) {
    if (!this.sourceVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute('aria-hidden', 'true');
      video.style.display = 'none';
      document.body.appendChild(video);
      this.sourceVideo = video;
    }

    const video = this.sourceVideo;
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) return resolve();
      video.addEventListener('loadeddata', () => resolve(), { once: true });
    });

    // Autoplay can still be refused; pose detection tolerates a paused frame
    // source better than a hard failure here, so this is best-effort.
    try {
      await video.play();
    } catch {
      /* ignore */
    }
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.sourceVideo) this.sourceVideo.srcObject = null;
  }
}

function describeError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        code: 'permission-denied',
        message: 'Camera access is blocked for this site.',
        hint: 'Allow the camera in the address bar (the camera icon), then start it again.',
        recoverable: true,
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'no-camera',
        message: 'No camera was found on this device.',
        hint: 'Connect a webcam and try again.',
        recoverable: true,
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'camera-busy',
        message: 'Another app is using the camera.',
        hint: 'Close video calls or other tabs using the camera, then try again.',
        recoverable: true,
      };
    case 'OverconstrainedError':
      return {
        code: 'constraints',
        message: 'This camera does not support the requested video settings.',
        hint: 'Pick a different camera from the list.',
        recoverable: true,
      };
    default:
      return {
        code: 'unknown',
        message: 'The camera could not be started.',
        hint: 'Reload the page and try again.',
        recoverable: true,
      };
  }
}

/** Single shared instance — the app only ever holds one webcam stream. */
export const cameraManager = new CameraManager();
export type { CameraManager };
