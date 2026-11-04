import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { GAME_CONFIG, POSE_CONFIG } from '../data/gameConfig';
import { createWithGpuCpuFallback } from './delegateFallback';
import { cameraManager } from './CameraManager';
import { analyzeFraming, emptyFraming } from './framing';
import type { PoseError, PoseListener, PoseState } from './poseTypes';
import type { Landmark } from './types';
import { LandmarkSmoother, RollingAverage } from '../utils/smoothing';

/**
 * Pose Detector — design doc section 8.2, Phase 3.
 *
 * Reads frames from the Camera Manager's hidden <video>, runs MediaPipe Pose
 * Landmarker on them, smooths the 33 landmarks and reports how well the player
 * is framed. Everything downstream (the exercise recognizer and gameplay,
 * Phase 7 rep counting) subscribes here rather than touching MediaPipe.
 */
class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private loading: Promise<boolean> | null = null;
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private lastFrameAt = 0;
  private readyStreak = 0;
  private generation = 0;

  private smoother = new LandmarkSmoother(POSE_CONFIG.smoothingAlpha);
  private fpsAverage = new RollingAverage(30);

  private listeners = new Set<PoseListener>();
  private state: PoseState = {
    status: 'idle',
    delegate: null,
    error: null,
    frame: null,
    fps: 0,
    readyToStart: false,
  };

  // ---------------------------------------------------------------- state

  getState(): PoseState {
    return this.state;
  }

  subscribe(listener: PoseListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<PoseState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  // -------------------------------------------------------------- actions

  /**
   * Load the model (once) and begin detecting. The camera must be running —
   * without a frame source the loop idles until one appears.
   */
  async start(): Promise<boolean> {
    const generation = this.generation;
    const loaded = await this.load();
    if (!loaded || generation !== this.generation) return false;

    if (this.rafId === null) {
      this.smoother.reset();
      this.fpsAverage.reset();
      this.lastVideoTime = -1;
      this.readyStreak = 0;
      this.setState({ status: 'running', error: null });
      this.rafId = requestAnimationFrame(this.tick);
    }
    return true;
  }

  stop() {
    this.generation += 1;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.smoother.reset();
    this.fpsAverage.reset();
    this.readyStreak = 0;
    this.setState({ status: 'idle', frame: null, fps: 0, readyToStart: false });
  }

  /** Free the model. Detection has to be re-loaded after this. */
  dispose() {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
    this.loading = null;
    this.listeners.clear();
  }

  // -------------------------------------------------------------- loading

  private async load(): Promise<boolean> {
    if (this.landmarker) return true;
    if (this.loading) return this.loading;

    this.setState({ status: 'loading', error: null });

    this.loading = (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(POSE_CONFIG.wasmPath);
        const model = POSE_CONFIG.delegate === 'GPU'
          ? await createWithGpuCpuFallback(
            () => this.createLandmarker(fileset, 'GPU'),
            () => this.createLandmarker(fileset, 'CPU'),
            (gpuError) => console.warn('[PoseDetector] GPU delegate unavailable; retrying with CPU', gpuError),
          )
          : { delegate: POSE_CONFIG.delegate, value: await this.createLandmarker(fileset, POSE_CONFIG.delegate) };
        this.landmarker = model.value;
        this.setState({ delegate: model.delegate });
        return true;
      } catch (err) {
        this.fail({
          message: 'The pose model could not be loaded with GPU or CPU.',
          hint: navigator.onLine
            ? 'Reload the page. If it keeps failing, check whether the model files are blocked by your network.'
            : 'You appear to be offline — the model is downloaded on first use.',
        });
        console.error('[PoseDetector] load failed', err);
        return false;
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }

  private createLandmarker(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, delegate: 'GPU' | 'CPU') {
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: POSE_CONFIG.modelPath,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: POSE_CONFIG.minPoseDetectionConfidence,
      minPosePresenceConfidence: POSE_CONFIG.minPosePresenceConfidence,
      minTrackingConfidence: POSE_CONFIG.minTrackingConfidence,
      outputSegmentationMasks: false,
    });
  }

  private async retryOnCpu(originalError: unknown) {
    const generation = this.generation;
    const gpuLandmarker = this.landmarker;
    this.landmarker = null;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    gpuLandmarker?.close();
    this.lastVideoTime = -1;
    this.lastFrameAt = 0;
    this.readyStreak = 0;
    this.setState({ status: 'loading', frame: null, readyToStart: false, error: null });

    try {
      const fileset = await FilesetResolver.forVisionTasks(POSE_CONFIG.wasmPath);
      const cpuLandmarker = await this.createLandmarker(fileset, 'CPU');
      if (generation !== this.generation) {
        cpuLandmarker.close();
        return;
      }
      this.landmarker = cpuLandmarker;
      this.setState({ status: 'running', delegate: 'CPU', error: null });
      this.rafId = requestAnimationFrame(this.tick);
    } catch (cpuError) {
      console.error('[PoseDetector] GPU detection failed', originalError);
      console.error('[PoseDetector] CPU fallback failed', cpuError);
      if (generation === this.generation) {
        this.fail({
          message: 'Pose detection failed on both GPU and CPU.',
          hint: 'Reload the page and check that your browser supports WebAssembly and WebGL.',
        });
      }
    }
  }

  private fail(error: PoseError) {
    this.setState({ status: 'error', error, frame: null, readyToStart: false });
  }

  // ----------------------------------------------------------------- loop

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick);

    const video = cameraManager.getFrameSource();
    if (!this.landmarker || !video || video.readyState < 2) return;

    // Hold the detection rate near the pose budget (section 20: 15–30 fps)
    // instead of running at display refresh rate.
    const now = performance.now();
    const minInterval = 1000 / GAME_CONFIG.targetFps;
    if (now - this.lastFrameAt < minInterval) return;

    // MediaPipe rejects repeated timestamps, so skip frames the camera has not
    // refreshed yet.
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    let landmarks: Landmark[] = [];
    let worldLandmarks: Landmark[] = [];

    try {
      const result = this.landmarker.detectForVideo(video, now);
      landmarks = (result.landmarks[0] ?? []) as Landmark[];
      worldLandmarks = (result.worldLandmarks[0] ?? []) as Landmark[];
    } catch (err) {
      if (this.state.delegate === 'GPU') {
        console.warn('[PoseDetector] GPU detection failed; retrying with CPU', err);
        void this.retryOnCpu(err);
      } else {
        console.error('[PoseDetector] detection failed', err);
        this.landmarker?.close();
        this.landmarker = null;
        this.stop();
        this.fail({
          message: 'Pose detection stopped unexpectedly.',
          hint: 'Reload the page to start it again.',
        });
      }
      return;
    }

    if (this.lastFrameAt > 0) {
      this.fpsAverage.push(1000 / (now - this.lastFrameAt));
    }
    this.lastFrameAt = now;

    if (landmarks.length === 0) {
      this.smoother.reset();
      this.readyStreak = 0;
      this.setState({
        frame: { landmarks: [], worldLandmarks: [], framing: emptyFraming(), timestamp: now },
        fps: Math.round(this.fpsAverage.value),
        readyToStart: false,
      });
      return;
    }

    const smoothed = this.smoother.apply(landmarks);
    const framing = analyzeFraming(smoothed);

    // Require a short stable stretch before unlocking Start, so a momentary
    // good frame while walking into position doesn't count.
    this.readyStreak = framing.ready ? this.readyStreak + 1 : 0;

    this.setState({
      status: 'running',
      frame: { landmarks: smoothed, worldLandmarks, framing, timestamp: now },
      fps: Math.round(this.fpsAverage.value),
      readyToStart: this.readyStreak >= POSE_CONFIG.readyHoldFrames,
    });
  };
}

export const poseDetector = new PoseDetector();
export type { PoseDetector };
