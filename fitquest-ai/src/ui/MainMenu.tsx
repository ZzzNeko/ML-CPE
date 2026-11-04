import type { MouseEventHandler, ReactNode } from 'react';
import { levelProgress, loadPlayerProfile } from './playerProfile';

interface MainMenuProps {
  onPlay: () => void;
  onStats: () => void;
  onSettings: () => void;
  onAchievements: () => void;
  onTestPoses: () => void;
  /** Slot for the ESP32 heart-rate badge (kept clear of the Player card). */
  children?: ReactNode;
}

type Box = { x: number; y: number; w: number; h: number };
const box = ({ x, y, w, h }: Box) => ({ '--x': x, '--y': y, '--w': w, '--h': h }) as React.CSSProperties;

/** Reference-artwork coordinates (1672 × 941). */
const POS = {
  play: { x: 85, y: 292, w: 585, h: 113 },
  stats: { x: 100, y: 417, w: 512, h: 82 },
  settings: { x: 100, y: 508, w: 492, h: 82 },
  achievements: { x: 100, y: 598, w: 476, h: 80 },
  testPoses: { x: 100, y: 688, w: 476, h: 72 },
  player: { x: 1287, y: 25, w: 353, h: 140 },
  best: { x: 1372, y: 712, w: 278, h: 163 },
} satisfies Record<string, Box>;

export function MainMenu({ onPlay, onStats, onSettings, onAchievements, onTestPoses, children }: MainMenuProps) {
  const profile = loadPlayerProfile();
  const { level, xp, xpToNext } = levelProgress(profile);
  return (
    <div className="fq-menu-layout">
      <div className="fq-stage">
        <Sparkle className="fq-spark" style={{ left: '5.6%', top: '3.2%', width: '3.4%' }} color="#ffd85a" />
        <Sparkle className="fq-spark" style={{ left: '12.6%', top: '2.6%', width: '2.5%', animationDelay: '-1s' }} color="#8fd8ff" />

        <img className="fq-logo" src="/assets/fitquest-logo.webp" alt="FitQuest AI — Move, Play, Get Fit!" draggable={false} decoding="async" />

        <img className="fq-hero" src="/assets/fitquest-mascot.webp" alt="FitQuest AI anime fitness mascot" draggable={false} decoding="async" />

        <span className="fq-note" style={{ left: '43.4%', top: '8.2%', fontSize: "calc(92 * var(--p))", ["--r" as string]: "-8deg" }}>♪</span>
        <span className="fq-note" style={{ left: '80.6%', top: '19.6%', fontSize: 'calc(88 * var(--p))', animationDelay: '-1.4s', ['--r' as string]: '6deg' }}>♫</span>
        <span className="fq-note" style={{ left: '77%', top: '35.4%', fontSize: 'calc(44 * var(--p))', color: '#9ff1ff', animationDelay: '-2.2s' }}>♪</span>
        <span className="fq-note" style={{ left: '55.4%', top: '55%', fontSize: 'calc(50 * var(--p))', animationDelay: '-.8s' }}>♪</span>
        <span className="fq-note" style={{ left: '37.8%', top: '54.4%', fontSize: 'calc(38 * var(--p))', color: '#ffb2ee', opacity: .7, animationDelay: '-3s' }}>♪</span>

        <div className="fq-slogan" aria-label="แข็งแรงขึ้น มีความสุขขึ้น ไปด้วยกัน">
          <span>แข็งแรงขึ้น</span><span>มีความสุขขึ้น</span><span>ไปด้วยกัน! ♡</span>
        </div>

        <nav aria-label="เมนูหลัก">
          <CrownIcon className="fq-play-crown" />
          <button type="button" className="fq-play fq-abs" style={box(POS.play)} onClick={onPlay}>
            <svg className="fq-play-tri" viewBox="0 0 64 64" aria-hidden="true">
              <defs><linearGradient id="fq-tri" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#f3d3ff" /></linearGradient></defs>
              <path d="M13 6.5c0-3.4 3.6-5.4 6.5-3.7l36.6 22.9c2.8 1.7 2.8 5.7 0 7.4L19.5 56.2c-2.9 1.8-6.5-.3-6.5-3.7Z" transform="translate(0 4)" fill="url(#fq-tri)" />
            </svg>
            <span className="fq-nav-copy"><strong>เริ่มเล่น</strong><small>ออกกำลังกายไปกับจังหวะเพลง!</small></span>
            <svg className="fq-play-chev" viewBox="0 0 48 48" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 10l14 14L8 38" /><path d="M24 10l14 14-14 14" />
            </svg>
          </button>

          <NavButton box={POS.stats} title="สถิติของฉัน" sub="ดูพัฒนาการและสถิติการเล่น" onClick={onStats}><StatsIcon /></NavButton>
          <NavButton box={POS.settings} title="ตั้งค่า" sub="ปรับเสียงและการเล่น" onClick={onSettings}><GearIcon /></NavButton>
          <NavButton box={POS.achievements} title="ความสำเร็จ" sub="ดูรางวัลที่ปลดล็อก" onClick={onAchievements}><TrophyIcon /></NavButton>
          <NavButton box={POS.testPoses} title="ทดสอบท่าทางทั้งหมด" sub="ดูผลจำแนกจาก CNN แบบเรียลไทม์" onClick={onTestPoses}><TestPoseIcon /></NavButton>
        </nav>

        <div className="fq-player fq-abs" style={box(POS.player)}>
          <div className="fq-player-avatar" aria-hidden="true"><CatFace /></div>
          <div className="fq-player-name"><CrownIcon />{profile.displayName}</div>
          <div className="fq-player-lv">Lv. {level}</div>
          <div className="fq-xp" role="progressbar" aria-valuemin={0} aria-valuemax={xpToNext} aria-valuenow={xp} aria-label="ค่าประสบการณ์"><i style={{ width: `${xp / xpToNext * 100}%` }} /></div>
          <div className="fq-xp-text">{xp} / {xpToNext} XP · เล่นแล้ว {profile.gamesPlayed} รอบ</div>
        </div>

        <aside className="fq-best fq-abs" style={box(POS.best)} aria-label="คะแนนสูงสุด">
          <div className="fq-best-title"><StarIcon />คะแนนสูงสุด</div>
          <div className="fq-best-score">{profile.bestScore.toLocaleString()}</div>
          <div className="fq-best-combo"><CrownIcon />คอมโบสูงสุด {profile.bestCombo}</div>
          <div className="fq-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </aside>

        <div className="fq-coach-banner" aria-hidden="true" />
        <div className="fq-coach-cat" aria-hidden="true"><CatFace happy /></div>
        <div className="fq-coach-bubble"><span>ขยับต่อไป!</span><span>ทำได้ดีมาก! <b>♥</b></span></div>

        {children && <div className="fq-hr-slot">{children}</div>}
      </div>
    </div>
  );
}

function NavButton({ box: b, title, sub, onClick, children }: { box: Box; title: string; sub: string; onClick: MouseEventHandler<HTMLButtonElement>; children: ReactNode }) {
  return (
    <button type="button" className="fq-nav fq-abs" style={box(b)} onClick={onClick}>
      <span className="fq-nav-icon" aria-hidden="true">{children}</span>
      <span className="fq-nav-copy"><strong>{title}</strong><small>{sub}</small></span>
    </button>
  );
}

/* ── Icons ─────────────────────────────────────────────────── */
function Sparkle({ className, style, color }: { className?: string; style?: React.CSSProperties; color: string }) {
  return (
    <svg className={className} style={{ position: 'absolute', ...style }} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 0c1.6 10.6 9.4 18.4 20 20-10.6 1.6-18.4 9.4-20 20C18.4 29.4 10.6 21.6 0 20 10.6 18.4 18.4 10.6 20 0Z" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
    </svg>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 30" aria-hidden="true">
      <defs><linearGradient id="fq-crown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe36e" /><stop offset="1" stopColor="#f5a623" /></linearGradient></defs>
      <path d="M3 8l9 7 8-12 8 12 9-7-3 19H6Z" fill="url(#fq-crown)" stroke="#fff3b8" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="3" cy="8" r="2.4" fill="#ffe36e" /><circle cx="20" cy="3" r="2.6" fill="#ffe36e" /><circle cx="37" cy="8" r="2.4" fill="#ffe36e" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 3l5 11.6 12.6 1.1-9.5 8.3 2.8 12.3L20 29.8 9.1 36.3l2.8-12.3-9.5-8.3L15 14.6Z" fill="#ffd24a" stroke="#fff0a8" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 60 60" fill="#fff"><rect x="6" y="38" width="11" height="16" rx="1.5" /><rect x="21" y="27" width="11" height="27" rx="1.5" /><rect x="36" y="15" width="11" height="39" rx="1.5" /><rect x="51" y="4" width="8" height="50" rx="1.5" opacity=".92" /></svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 60 60" fill="none"><path fill="#fff" fillRule="evenodd" d="M26 4h8l1.6 7.2c1.8.6 3.4 1.5 5 2.6l7-2.2 4 6.9-5.4 5c.2 1.2.3 2.4.3 3.6s-.1 2.4-.3 3.6l5.4 5-4 6.9-7-2.2c-1.6 1.1-3.2 2-5 2.6L34 56h-8l-1.6-7.2c-1.8-.6-3.4-1.5-5-2.6l-7 2.2-4-6.9 5.4-5A18 18 0 0 1 13.500 30c0-1.200.1-2.400.3-3.600l-5.400-5 4-6.900 7 2.200c1.600-1.100 3.200-2 5-2.600ZM30 21a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" /></svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 60 60" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 6h26v16a13 13 0 0 1-26 0Z" /><path d="M17 12H6c0 9 4 14 11 15M43 12h11c0 9-4 14-11 15" /><path d="M30 35v10M20 54h20M23 45h14v9H23Z" />
      <path d="M30 14l2.2 4.600 5 .6-3.700 3.400 1 5L30 25l-4.500 2.600 1-5-3.700-3.400 5-.6Z" fill="#fff" stroke="none" />
    </svg>
  );
}

function TestPoseIcon() {
  return (
    <svg viewBox="0 0 60 60" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="30" cy="30" r="23" />
      <path d="M30 16v14l10 7" />
      <path d="M18 45h24" />
    </svg>
  );
}

function CatFace({ happy = false }: { happy?: boolean }) {
  return <img
    src={happy ? '/assets/gameplay/cats/cheer.webp' : '/assets/gameplay/cats/idle.webp'}
    alt=""
    draggable={false}
    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
  />;
}
