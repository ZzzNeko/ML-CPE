import { useEffect, useState } from 'react';
import type { PoseFrame, PoseStatus } from '../ai/poseTypes';
import { CnnExerciseRecognizer, type CnnResult } from '../ai/CnnExerciseRecognizer';

const CLASS_LABELS: Record<string, string> = {
  arm_raise: 'ยกแขนทั้งสองข้าง',
  jumping_jack: 'กระโดดตบ',
  knee_left: 'ยกเข่าซ้าย',
  knee_right: 'ยกเข่าขวา',
  left_arm_up: 'ยกแขนซ้าย',
  right_arm_up: 'ยกแขนขวา',
  squat: 'ย่อเข่า (สควอช)',
  standing: 'ยืนตรง',
};

interface CnnPoseTestPanelProps {
  frame: PoseFrame | null;
  poseStatus: PoseStatus;
  onClose: () => void;
}

export function CnnPoseTestPanel({ frame, poseStatus, onClose }: CnnPoseTestPanelProps) {
  const [recognizer] = useState(() => new CnnExerciseRecognizer());
  const [prediction, setPrediction] = useState<CnnResult | null>(null);

  useEffect(() => {
    if (!frame) return;
    const update = requestAnimationFrame(() => {
      setPrediction(recognizer.predict(frame.landmarks));
    });
    return () => cancelAnimationFrame(update);
  }, [frame, recognizer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const unavailable = recognizer.isUnavailable;
  const probabilities = prediction?.probabilities;
  const classes = probabilities ? Object.keys(probabilities) : Object.keys(CLASS_LABELS);
  const statusText = poseStatus === 'error'
    ? 'ตรวจจับท่าทางไม่สำเร็จ ตรวจสอบกล้องและลองใหม่'
    : poseStatus !== 'running'
      ? 'กำลังเชื่อมต่อกล้องและระบบตรวจจับท่าทาง…'
      : unavailable
        ? 'โหลดโมเดล CNN ไม่สำเร็จ กรุณารีโหลดหน้าเว็บ'
        : prediction
          ? `CNN กำลังจำแนก: ${CLASS_LABELS[prediction.label] ?? prediction.label} (${Math.round(prediction.probability * 100)}%)`
          : 'กำลังโหลดโมเดลหรือเก็บข้อมูลท่าทาง 30 เฟรมแรก…';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        aria-labelledby="cnn-pose-test-title"
        aria-modal="true"
        className="fq-panel flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-violet-300/50 bg-[#171144]/95 shadow-[0_0_50px_rgba(114,91,255,.3)]"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-cyan-200">CNN LIVE TEST</p>
            <h2 className="mt-1 text-xl font-extrabold sm:text-2xl" id="cnn-pose-test-title">ทดสอบท่าทางทั้งหมด</h2>
            <p className="mt-1 text-xs text-violet-100/70">ลองทำแต่ละท่าของ FitQuest แล้วดูคะแนนที่โมเดล CNN จำแนกได้</p>
          </div>
          <button
            aria-label="ปิดหน้าทดสอบ"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-xl text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div aria-live="polite" className="border-b border-white/10 bg-white/[.04] px-5 py-3 text-sm font-semibold text-cyan-100 sm:px-7">
          {statusText}
        </div>

        <div className="grid min-h-0 gap-2 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
          {classes.map((name) => {
            const probability = probabilities?.[name] ?? 0;
            const isBest = prediction?.label === name;
            return (
              <div className={`rounded-xl border px-3 py-2.5 ${isBest ? 'border-cyan-300/70 bg-cyan-300/10' : 'border-white/10 bg-black/10'}`} key={name}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className={isBest ? 'font-bold text-white' : 'text-violet-100/80'}>{CLASS_LABELS[name] ?? name}</span>
                  <span className="shrink-0 font-bold tabular-nums text-cyan-100">{Math.round(probability * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${isBest ? 'bg-gradient-to-r from-cyan-300 to-fuchsia-400' : 'bg-violet-400/70'}`}
                    style={{ width: `${Math.min(100, Math.max(0, probability * 100))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <footer className="border-t border-white/10 px-5 py-3 text-center text-[11px] leading-relaxed text-violet-100/60 sm:px-7">
          เกมเลือกคลาสอันดับหนึ่งเท่านั้น แถบอื่นเป็นคะแนนเปรียบเทียบ · เปอร์เซ็นต์ไม่ใช่การรับประกันความแม่นยำ
        </footer>
      </section>
    </div>
  );
}
