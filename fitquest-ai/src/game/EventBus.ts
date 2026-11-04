// Simple typed event bus used to let the React UI (Score, Timer, Feedback panels)
// and the Phaser scenes talk to each other without being tightly coupled.
type Handler = (...args: any[]) => void;

class EventBus {
  private handlers: Map<string, Set<Handler>> = new Map();

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]) {
    this.handlers.get(event)?.forEach((h) => h(...args));
  }
}

export const eventBus = new EventBus();

// Well-known event names shared across the app
export const GameEvents = {
  SCENE_READY: 'scene-ready',
  SCORE_UPDATED: 'score-updated',
  REP_COUNTED: 'rep-counted',
  COMBO_UPDATED: 'combo-updated',
  GAME_OVER: 'game-over',

  // Camera + scene navigation
  SCENE_CHANGED: 'scene-changed', // payload: scene key, so React can overlay the right panel
  CAMERA_STATE: 'camera-state', // payload: CameraState, emitted by useCamera
  RESULT_READY: 'result-ready', // payload: ResultData
  RESULT_RESTART: 'result-restart', // React -> Phaser
  RESULT_MENU: 'result-menu', // React -> Phaser

  // Rhythm modes (touch + pose)
  RHYTHM_HUD: 'rhythm-hud', // Phaser -> React: HudState (score, combo, fever, time left)
  RHYTHM_ACCURACY: 'rhythm-accuracy', // payload: 0-100
  RHYTHM_QUIT: 'rhythm-quit', // React -> Phaser: leave the rhythm scene
  RHYTHM_JUDGE: 'rhythm-judge', // Phaser -> React: { grade, gained, combo }
  RHYTHM_NOTES: 'rhythm-notes', // Phaser -> React: current / previous / next pose + match + timing
  RHYTHM_POPUP: 'rhythm-popup', // Phaser -> React: { text } (FEVER!, CHAIN, tempo changes ...)
  RHYTHM_COUNT: 'rhythm-count', // Phaser -> React: { n, beat } pre-start count-in (n = 0 means GO!)
} as const;
