import { useHeartRate } from './useHeartRate';

export function HeartRateBadge({ inline = false }: { inline?: boolean }) {
  const hr = useHeartRate();
  if (inline && !hr.online) return null;

  let value = '--';
  let note = 'กำลังเชื่อมต่อ ESP32';
  if (!hr.online) note = 'สายรัดข้อมือออฟไลน์';
  else if (!hr.finger) note = 'กำลังรอสัญญาณเซนเซอร์';
  else if (hr.bpm === null) note = 'รอค่าชีพจรที่ถูกต้อง…';
  else { value = String(hr.bpm); note = 'BPM · ESP32'; }

  const beating = hr.online && hr.finger && hr.bpm !== null;
  const pulseDuration = beating ? Math.max(0.45, Math.min(1.6, 60 / hr.bpm!)) : 1;

  return (
    <div
      className={`fq-hud pointer-events-none z-20 flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl ${inline ? '' : 'absolute right-4 top-16 sm:right-7 sm:top-[76px]'}`}
      style={{
        borderColor: beating ? 'rgba(205,184,146,.42)' : 'rgba(255,255,255,.12)',
        background: 'rgba(10,10,11,.58)',
        boxShadow: beating ? '0 0 28px rgba(205,184,146,.10)' : 'none',
        transition: 'border-color .3s ease, box-shadow .3s ease',
      }}
      aria-live="polite"
      aria-label={beating ? `Heart rate ${value} beats per minute from ESP32` : note}
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill={beating ? 'var(--fq-accent)' : 'none'}
        stroke={beating ? 'var(--fq-accent)' : 'var(--fq-faint)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        aria-hidden="true"
        style={beating ? {
          animation: `fq-beat ${pulseDuration.toFixed(2)}s ease-in-out infinite`,
          filter: 'drop-shadow(0 0 5px rgba(205,184,146,.45))',
        } : undefined}
      >
        <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
      </svg>
      <div className="text-right">
        <div
          className="fq-num text-2xl leading-none"
          style={{
            fontFamily: 'var(--fq-serif)',
            fontWeight: 400,
            color: beating ? 'var(--fq-text)' : 'var(--fq-faint)',
            transition: 'color .25s ease',
          }}
        >
          {value}
        </div>
        <div className="fq-label mt-1">{note}</div>
        {beating && (
          <div className="mt-2 h-0.5 w-16 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
            <div className="h-full w-1/2 rounded-full" style={{ background: 'var(--fq-accent)', animation: 'fq-signal 1.8s ease-in-out infinite alternate' }} />
          </div>
        )}
      </div>
    </div>
  );
}
