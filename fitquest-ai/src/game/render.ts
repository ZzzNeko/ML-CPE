import Phaser from 'phaser';
import { GAME_CONFIG } from '../data/gameConfig';

/**
 * All game layout is authored on a 960×540 logical canvas. To keep it sharp on
 * big and high-DPI screens the real canvas is RENDER_SCALE× larger and every
 * scene zooms its camera by the same factor, so shapes stay vector-crisp and
 * text is rasterised at the real pixel density (see `makeText`).
 */
function pickScale(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const aspect = GAME_CONFIG.width / GAME_CONFIG.height;
  // The canvas is letterboxed (FIT), so size against the largest 16:9 box that fits the window.
  const fitWidth = Math.min(window.innerWidth, window.innerHeight * aspect);
  return Math.min(3, Math.max(1, Math.ceil((fitWidth * dpr) / GAME_CONFIG.width)));
}

export const RENDER_SCALE = pickScale();

export const IVORY = 0xf2efe9;
export const CHAMPAGNE = 0xcdb892;
export const DIM = 0x9a968c;
export const DANGER = 0xc4837c;
export const SANS = 'Inter, "Noto Sans Thai", system-ui, sans-serif';
export const SERIF = '"Cormorant Garamond", Georgia, serif';

/** Call first thing in every scene's create(): maps logical 960×540 onto the hi-res canvas. */
export function applyRenderScale(scene: Phaser.Scene) {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  cam.centerOn(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2);
}

export interface TextOptions {
  font?: string;
  weight?: number | string;
  /** Soft dark shadow so text stays readable over a bright camera feed (default on). */
  shadow?: boolean;
}

/** Text that is rasterised at the real pixel density, centred on (x, y). */
export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  opts: TextOptions = {},
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, value, {
      fontFamily: opts.font ?? SANS,
      fontSize: `${size}px`,
      fontStyle: opts.weight !== undefined ? String(opts.weight) : '400',
      color,
      resolution: RENDER_SCALE,
      padding: { x: 4, y: 6 },
    })
    .setOrigin(0.5);
  if (opts.shadow !== false) t.setShadow(0, 1, 'rgba(0,0,0,0.55)', 6, false, true);
  return t;
}
