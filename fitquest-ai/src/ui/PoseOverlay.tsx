import { useEffect, useRef } from 'react';
import { poseDetector } from '../ai/PoseDetector';
import { DRAWN_JOINTS, SKELETON_CONNECTIONS } from '../ai/landmarks';
import type { Landmark } from '../ai/types';
import { CAMERA_CONFIG, POSE_CONFIG } from '../data/gameConfig';

const GOOD = '#f2efe9';
const WARN = '#cdb892';

/**
 * Draws the 33-point skeleton on top of the camera feed. Painted straight from
 * the detector's subscription rather than React state, so the overlay keeps up
 * with detection without re-rendering the tree every frame.
 */
export function PoseOverlay({ lineWidth = 3 }: { lineWidth?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match the backing store to the displayed size so lines stay crisp.
    let scale = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      scale = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const unsubscribe = poseDetector.subscribe((state) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const landmarks = state.frame?.landmarks;
      if (!landmarks || landmarks.length === 0) return;
      draw(ctx, canvas, landmarks, state.frame?.framing.ready ?? false, lineWidth * scale);
    });

    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [lineWidth]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  framingOk: boolean,
  lineWidth: number,
) {
  const { width, height } = canvas;
  const color = framingOk ? GOOD : WARN;

  // The feed is mirrored for a selfie view, so mirror the landmarks to match.
  const px = (p: Landmark) => (CAMERA_CONFIG.mirror ? 1 - p.x : p.x) * width;
  const py = (p: Landmark) => p.y * height;
  const seen = (p?: Landmark) => (p?.visibility ?? 0) >= POSE_CONFIG.visibilityThreshold;

  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;

  for (const [from, to] of SKELETON_CONNECTIONS) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!seen(a) || !seen(b)) continue;
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.stroke();
  }

  ctx.fillStyle = color;
  for (const index of DRAWN_JOINTS) {
    const point = landmarks[index];
    if (!seen(point)) continue;
    ctx.beginPath();
    ctx.arc(px(point), py(point), lineWidth * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
