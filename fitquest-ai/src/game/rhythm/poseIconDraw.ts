import Phaser from 'phaser';
import type { PoseIcon } from '../../ai/poseTargets';
import { CAMERA_CONFIG } from '../../data/gameConfig';

/**
 * Draws a pose stick figure centred on (cx, cy). `size` is the icon's box in
 * game pixels. The figure is shown the way the player sees themselves, so the
 * left/right flip follows the camera mirroring.
 */
export function drawPoseIcon(
  g: Phaser.GameObjects.Graphics,
  icon: PoseIcon,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
  lineW: number,
) {
  const s = size / 2.4;
  const flip = CAMERA_CONFIG.mirror ? 1 : -1;
  const oy = cy + size * 0.06;
  const P = (p: [number, number]) => ({ x: cx + p[0] * s * flip, y: oy + p[1] * s });
  const j = icon.joints;
  const neck = P(icon.neck);
  const head = P(icon.head);
  const hipMid = P([(j.lh[0] + j.rh[0]) / 2, (j.lh[1] + j.rh[1]) / 2]);

  g.lineStyle(lineW, color, alpha);
  const line = (...pts: { x: number; y: number }[]) => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
  };
  line(P(j.ls), neck, P(j.rs));
  line(P(j.ls), P(j.le), P(j.lw));
  line(P(j.rs), P(j.re), P(j.rw));
  line(neck, hipMid);
  line(P(j.lh), P(j.rh));
  line(P(j.lh), P(j.lk), P(j.la));
  line(P(j.rh), P(j.rk), P(j.ra));
  g.strokeCircle(head.x, head.y, 0.13 * s);
}
