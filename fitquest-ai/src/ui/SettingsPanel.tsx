import type { GameSettings } from './settings';

interface Props {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}

const LEVELS: GameSettings['difficulty'][] = ['easy', 'normal', 'hard'];

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  const update = (patch: Partial<GameSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="fq-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <section
        className="fq-fade fq-panel w-full max-w-md p-7 sm:p-8"
        style={{ background: 'var(--fq-surface-solid)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ตั้งค่าเกม"
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="fq-label">FITQUEST AI</p>
            <h2 className="fq-serif mt-1 text-4xl">ตั้งค่าเกม</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดหน้าต่างตั้งค่า" className="-mr-2 -mt-1 p-2 text-lg" style={{ color: 'var(--fq-muted)' }}>
            ✕
          </button>
        </div>

        <div>
          <p className="fq-label mb-3">ระดับความยาก</p>
          <div className="grid grid-cols-3 rounded-full border p-1" style={{ borderColor: 'var(--fq-line)' }}>
            {LEVELS.map((level) => {
              const active = settings.difficulty === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => update({ difficulty: level })}
                  className="rounded-full py-2 text-[11px] uppercase tracking-[.18em] transition-colors"
                  style={{ background: active ? 'var(--fq-text)' : 'transparent', color: active ? '#0a0a0b' : 'var(--fq-muted)', fontWeight: active ? 500 : 400 }}
                >
                  {level === 'easy' ? 'ง่าย' : level === 'normal' ? 'ปกติ' : 'ยาก'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <p className="fq-label">ระดับเสียง</p>
          <VolumeSlider label="เสียงเพลง" value={settings.musicVolume} onChange={(v) => update({ musicVolume: v })} />
          <VolumeSlider label="เสียงเอฟเฟกต์ในเกม" value={settings.effectVolume} onChange={(v) => update({ effectVolume: v })} />
          <VolumeSlider label="เสียง UI และปุ่ม" value={settings.uiVolume} onChange={(v) => update({ uiVolume: v })} />
        </div>

        <div className="mt-6 divide-y divide-white/10 border-y" style={{ borderColor: 'var(--fq-line)' }}>
          <Toggle label="แสดงภาพกล้องระหว่างเล่น" checked={settings.showCameraPreview} onChange={(v) => update({ showCameraPreview: v })} />
          <Toggle label="ลดภาพเคลื่อนไหวของหน้าจอ" checked={settings.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
        </div>

        <p className="mt-5 text-xs leading-relaxed" style={{ color: 'var(--fq-faint)' }}>
          การตั้งค่าจะบันทึกไว้ในเบราว์เซอร์นี้ ภาพจากกล้องจะไม่ถูกส่งออกจากอุปกรณ์
        </p>

        <button type="button" onClick={onClose} className="fq-btn fq-btn-primary mt-7 w-full">
          บันทึกและปิด
        </button>
      </section>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <span className="text-sm" style={{ color: 'var(--fq-text)' }}>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="fq-switch" />
    </div>
  );
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--fq-text)' }}>
        <span>{label}</span><strong className="tabular-nums" style={{ color: '#ffb4f0' }}>{value}%</strong>
      </span>
      <input
        type="range" min={0} max={100} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-fuchsia-400"
      />
    </label>
  );
}
