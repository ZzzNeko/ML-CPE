import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { eventBus, GameEvents } from '../game/EventBus';
import { isMotion, JUMPING_JACK, noteIcon, noteLabel, POSE_TARGETS, type NoteTarget } from '../ai/poseTargets';
import { CAMERA_CONFIG } from '../data/gameConfig';
import { loadYouTubeSong } from '../game/rhythm/youtubeSong';
import { useHeartRate } from './useHeartRate';
import './play-hud.css';

/* ───────────────────────── types & constants ───────────────────────── */

const STAGE_W = 1672;
const STAGE_H = 941;
const MISSION_REPS = 30;
const MISSION_KCAL = 300;
const MISSION_MIN = 20;
const XP_PER_LEVEL = 800;

type Grade = 'perfect' | 'great' | 'good' | 'miss';

interface HudState { score: number; combo: number; fever: number; feverOn: boolean; mult: number; remaining: number; total: number; bpm: number }
const EMPTY: HudState = { score: 0, combo: 0, fever: 0, feverOn: false, mult: 1, remaining: 0, total: 0, bpm: 0 };

interface NoteRef { id: number; pose: NoteTarget }
interface NotesState {
  prev: NoteRef | null;
  current: (NoteRef & { kind: string; duration: number; challenge?: 'perfect' }) | null;
  next: NoteRef | null;
  match: number; threshold: number; until: number; beatPhase: number; bpm: number;
}
const NO_NOTES: NotesState = { prev: null, current: null, next: null, match: 0, threshold: 1, until: 0, beatPhase: 0, bpm: 0 };

interface Judge { id: number; grade: Grade; gained: number; combo: number }
interface Popup { id: number; text: string }

/* ───────────────────────── daily / lifetime progress ───────────────────────── */

const STORE_KEY = 'fitquest.progress.v1';
interface Progress { date: string; reps: number; kcal: number; sec: number; lifeReps: number; xp: number }
const today = () => new Date().toISOString().slice(0, 10);
function loadProgress(): Progress {
  const fresh: Progress = { date: today(), reps: 0, kcal: 0, sec: 0, lifeReps: 0, xp: 0 };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fresh;
    const p = { ...fresh, ...(JSON.parse(raw) as Partial<Progress>) };
    return p.date === fresh.date ? p : { ...p, date: fresh.date, reps: 0, kcal: 0, sec: 0 };
  } catch { return fresh; }
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* storage may be unavailable */ }
}

/* ───────────────────────── helpers ───────────────────────── */

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
const labelEn = (t: NoteTarget) => (isMotion(t) ? JUMPING_JACK.labelEn : POSE_TARGETS[t].labelEn);
const thaiShort = (t: NoteTarget) => noteLabel(t).replace(/\s*\(.*\)\s*$/, '');

const JUDGE_TEXT: Record<Grade, string> = { perfect: 'PERFECT!', great: 'GREAT', good: 'GOOD', miss: 'MISS' };

function coachLines(judge: Judge | null, feverOn: boolean): [string, string] {
  if (feverOn) return ['ไฟลุกแล้ว!', 'คะแนนโบนัสกำลังทำงาน เร่งต่ออีกนิด!'];
  if (!judge) return ['พร้อมแล้วนะ!', 'ทำท่าให้ตรงจังหวะเพลงเลย!'];
  if (judge.grade === 'perfect') return ['เยี่ยมมาก!', 'ทำได้ดีมากเลย ต่อไปเราจะไปให้ไกลกว่านี้กัน!'];
  if (judge.grade === 'miss') return ['ไม่เป็นไร!', 'ตั้งสติ แล้วลองท่าถัดไปใหม่นะ'];
  return ['ดีมาก!', 'อีกนิดเดียวจะเป๊ะแล้ว สู้ ๆ!'];
}

/* ───────────────────────── scale-to-fit stage ───────────────────────── */

function useStageScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setK(Math.min(r.width / STAGE_W, r.height / STAGE_H) || 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, k] as const;
}

/** Hover parallax: side panels follow the cursor with a small 3-D tilt (CSS reads --mx / --my). */
const tiltProps = {
  onMouseMove: (e: ReactMouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty('--mx', String(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)).toFixed(3)));
    el.style.setProperty('--my', String(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)).toFixed(3)));
  },
  onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => {
    e.currentTarget.style.removeProperty('--mx');
    e.currentTarget.style.removeProperty('--my');
  },
};

/* ───────────────────────── main component ───────────────────────── */

interface PlayHudProps { onOpenSettings?: () => void; onQuit?: () => void }

export function PlayHud({ onOpenSettings, onQuit }: PlayHudProps) {
  const [rootRef, k] = useStageScale();
  const [h, setH] = useState<HudState>(EMPTY);
  const [reps, setReps] = useState(0);
  const [gain, setGain] = useState<{ id: number; n: number } | null>(null);
  const [notes, setNotes] = useState<NotesState>(NO_NOTES);
  const [judge, setJudge] = useState<Judge | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [questOpen, setQuestOpen] = useState(true);
  const [questCompact, setQuestCompact] = useState(false);
  const [achOpen, setAchOpen] = useState(true);
  const [flash, setFlash] = useState(0);
  const [count, setCount] = useState<{ id: number; n: number; beat: number } | null>(null);
  const [frame, setFrame] = useState<0 | 1>(0);
  const [base, setBase] = useState<Progress>(loadProgress);
  const lastScore = useRef(0);
  const uid = useRef(1);
  const hr = useHeartRate();

  useEffect(() => {
    const reset = () => {
      setBase(loadProgress());
      lastScore.current = 0;
      setH(EMPTY); setReps(0); setGain(null); setNotes(NO_NOTES);
      setJudge(null); setPopups([]); setCount(null);
    };
    let countTimer = 0;
    const offs = [
      eventBus.on(GameEvents.RHYTHM_HUD, (s: HudState) => {
        const d = s.score - lastScore.current;
        lastScore.current = s.score;
        if (d > 0) setGain({ id: uid.current++, n: d });
        setH(s);
      }),
      eventBus.on(GameEvents.SCENE_READY, reset),
      eventBus.on(GameEvents.REP_COUNTED, (n: number) => setReps(Math.max(0, n))),
      eventBus.on(GameEvents.RHYTHM_NOTES, (n: NotesState) => setNotes(n)),
      eventBus.on(GameEvents.RHYTHM_JUDGE, (j: { grade: Grade; gained: number; combo: number }) => {
        setJudge({ id: uid.current++, ...j });
      }),
      eventBus.on(GameEvents.RHYTHM_COUNT, (c: { n: number; beat: number }) => {
        const id = uid.current++;
        setCount({ id, n: c.n, beat: c.beat });
        window.clearTimeout(countTimer);
        countTimer = window.setTimeout(() => setCount((cur) => (cur && cur.id === id ? null : cur)), Math.max(500, c.beat * 1000));
      }),
      eventBus.on(GameEvents.RHYTHM_POPUP, (p: { text: string }) => {
        const id = uid.current++;
        setPopups((l) => [...l.slice(-2), { id, text: p.text }]);
        window.setTimeout(() => setPopups((l) => l.filter((x) => x.id !== id)), 1700);
      }),
    ];
    return () => { offs.forEach((off) => off()); window.clearTimeout(countTimer); };
  }, []);

  // Jumping-jack icon alternates open / closed on the beat.
  const bpm = notes.bpm || h.bpm || 90;
  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), Math.max(250, 60000 / bpm));
    return () => window.clearInterval(id);
  }, [bpm]);

  /* progress numbers (today + this round) */
  const elapsed = h.total > 0 ? Math.max(0, Math.min(h.total, h.total - h.remaining)) : 0;
  const roundKcal = elapsed * 0.08 + reps * 0.45;
  const dayReps = base.reps + reps;
  const dayKcal = base.kcal + roundKcal;
  const dayMin = (base.sec + elapsed) / 60;
  const lifeReps = base.lifeReps + reps;
  const xpTotal = base.xp + Math.floor(h.score / 10);
  const level = Math.floor(xpTotal / XP_PER_LEVEL) + 1;
  const xpInLevel = xpTotal % XP_PER_LEVEL;
  const progress = h.total > 0 ? Math.min(100, (elapsed / h.total) * 100) : 0;

  // Persist (the 1 s clock tick that drives `elapsed` throttles this).
  useEffect(() => {
    saveProgress({
      date: base.date,
      reps: dayReps, kcal: Math.round(dayKcal * 10) / 10, sec: Math.round(base.sec + elapsed),
      lifeReps, xp: xpTotal,
    });
  }, [dayReps, dayKcal, elapsed, lifeReps, xpTotal]);

  const snapshot = useCallback(() => {
    const video = document.querySelector<HTMLVideoElement>('video.fq-camera-bg');
    if (!video || !video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (CAMERA_CONFIG.mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const game = document.querySelector<HTMLCanvasElement>('.fq-phaser-layer canvas');
    if (game) {
      const s = Math.min(c.width / game.width, c.height / game.height);
      ctx.drawImage(game, (c.width - game.width * s) / 2, (c.height - game.height * s) / 2, game.width * s, game.height * s);
    }
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fitquest-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
    setFlash((n) => n + 1);
  }, []);

  const combo = Math.max(0, h.combo);
  const [coachTitle, coachBody] = coachLines(judge, h.feverOn);
  const missed = judge?.grade === 'miss';
  const catLine = h.feverOn
    ? 'FEVER! คะแนนคูณแล้วนะ'
    : missed ? 'ไม่เป็นไรนะ!'
    : combo >= 5 ? `คอมโบ ×${combo}! รักษาจังหวะไว้เลย` : judge ? 'กำลังทำได้ดีมาก!' : 'พร้อมลุยแล้วนะ!';
  const catSub = h.feverOn ? 'อย่าหยุดนะ!' : missed ? 'ตามจังหวะเพลงแล้วลองใหม่!' : 'รักษาจังหวะไว้เลย!';
  const catMood: CatKind = h.feverOn ? 'excited' : !judge ? 'happy' : judge.grade === 'miss' ? 'sad' : judge.grade === 'perfect' ? (combo >= 5 ? 'cheer' : 'perfect') : judge.grade === 'great' ? 'happy' : 'idle';
  const tagText = h.feverOn ? 'FEVER!' : judge ? JUDGE_TEXT[judge.grade] : 'READY';
  const tagKind = h.feverOn ? 'perfect' : judge?.grade ?? 'good';
  const youtubeSelected = !!loadYouTubeSong();

  const cur = notes.current;
  const matched = !!cur && notes.match >= notes.threshold;
  const poseProgress = cur ? Math.max(0, Math.min(1, 1 - notes.until / Math.max(0.25, 60 / bpm))) : 0;
  const beatCheck = !!cur && notes.until <= 0 && notes.until > -0.15;
  // Phase is captured when a target appears; CSS handles the beat flash independently of FPS.
  const beatPhase = notes.beatPhase;
  const beatStyle = useMemo(() => ({ ['--beat' as string]: `${(60 / bpm).toFixed(3)}s` }), [bpm]);

  const heartOk = hr.online && hr.finger && hr.bpm !== null;
  const bars = heartOk ? (hr.rssi === null ? 4 : hr.rssi > -60 ? 4 : hr.rssi > -70 ? 3 : hr.rssi > -80 ? 2 : 1) : hr.online ? 1 : 0;

  return (
    <div ref={rootRef} className={`pq-root${h.feverOn ? ' fever' : ''}${youtubeSelected ? ' youtube-selected' : ''}`} aria-label="Gameplay HUD">
      <div className="pq-tint" />
      <div className="pq-fever-frame" />
      {flash > 0 && <div key={flash} className="pq-shutter" />}
      <div className="pq-stage" style={{ transform: `translate(-50%,-50%) scale(${k})`, ...beatStyle }}>
        <Decor />

        {/* ── top bar ── */}
        <img className="pq-logo" src="/assets/fitquest-logo.webp" alt="FitQuest AI" draggable={false} />
        <div className="pq-logo-cat"><Cat kind="happy" /></div>

        <div className="pq-pill pq-score">
          <span className="pq-pill-ico"><IcoStar /></span>
          <span className="pq-pill-copy"><small>SCORE</small><b>{h.score.toLocaleString()}</b></span>
          {gain && <em key={gain.id} className="pq-gain">+{gain.n.toLocaleString()}</em>}
        </div>
        <div className="pq-pill pq-time">
          <span className="pq-pill-ico"><IcoStopwatch /></span>
          <span className="pq-pill-copy"><small>TIME</small><b>{clock(h.remaining)}</b></span>
        </div>
        <div className="pq-pill pq-combo">
          <span className="pq-pill-ico"><IcoFlame /></span>
          <span className="pq-pill-copy"><small>COMBO</small><b>x{combo}</b></span>
          {(h.feverOn || judge?.grade === 'perfect') && <span key={judge?.id ?? 0} className={`pq-tag ${tagKind}`}>{tagText}</span>}
        </div>
        <div className="pq-pill pq-level">
          <span className="pq-avatar"><Cat kind="idle" /></span>
          <span className="pq-level-copy">
            <b>Lv. {level}</b>
            <span className="pq-bar"><i style={{ width: pct(xpInLevel, XP_PER_LEVEL) }} /></span>
            <small>{xpInLevel} / {XP_PER_LEVEL} XP</small>
          </span>
        </div>

        {/* ── daily missions ── */}
        {questOpen ? (
          <section className={`pq-panel pq-quests${questCompact ? ' compact' : ''}`} {...tiltProps}>
            <header>
              <IcoCrown /><h3>ภารกิจประจำวัน</h3>
              <button type="button" aria-label="ย่อ/ขยาย" onClick={() => setQuestCompact((v) => !v)}><IcoShuffle /></button>
              <button type="button" aria-label="ปิด" onClick={() => setQuestOpen(false)}><IcoClose /></button>
            </header>
            <div className="pq-mission hero">
              <span className="pq-avatar"><Cat kind="happy" /></span>
              <div>
                <p>ทำท่าให้ครบ {MISSION_REPS} ครั้ง</p>
                <div className="pq-row"><span className="pq-bar"><i style={{ width: pct(dayReps, MISSION_REPS) }} /></span><small>{Math.min(dayReps, MISSION_REPS)} / {MISSION_REPS}</small></div>
              </div>
            </div>
            {!questCompact && (
              <>
                <div className="pq-mission">
                  <span className="pq-ico-badge"><IcoPlus /></span>
                  <div>
                    <p>เผาผลาญ {MISSION_KCAL} kcal</p>
                    <div className="pq-row"><span className="pq-bar"><i style={{ width: pct(dayKcal, MISSION_KCAL) }} /></span><small>{Math.min(MISSION_KCAL, Math.round(dayKcal))} / {MISSION_KCAL}</small></div>
                  </div>
                </div>
                <div className="pq-mission">
                  <span className="pq-ico-badge"><IcoStopwatch /></span>
                  <div>
                    <p>ออกกำลังกาย {MISSION_MIN} นาที</p>
                    <div className="pq-row"><span className="pq-bar"><i style={{ width: pct(dayMin, MISSION_MIN) }} /></span><small>{Math.min(MISSION_MIN, Math.floor(dayMin))} / {MISSION_MIN}</small></div>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : (
          <button type="button" className="pq-reopen pq-quests-tab" onClick={() => setQuestOpen(true)}><IcoCrown />ภารกิจ</button>
        )}

        {/* ── achievements ── */}
        {!youtubeSelected && (achOpen ? (
          <section className="pq-panel pq-ach" {...tiltProps}>
            <header>
              <IcoTrophy /><h3>ความสำเร็จ</h3>
              <button type="button" aria-label="ปิด" onClick={() => setAchOpen(false)}><IcoClose /></button>
            </header>
            <Achievement title="เริ่มต้นการเดินทาง" sub="ทำครบ 10 ครั้ง" done={lifeReps >= 10} icon={<IcoShield />} />
            <Achievement title="นักสู้สายฟิต" sub="ทำครบ 100 ครั้ง" done={lifeReps >= 100} icon={<IcoMedal />} />
          </section>
        ) : (
          <button type="button" className="pq-reopen pq-ach-tab" onClick={() => setAchOpen(true)}><IcoTrophy />ความสำเร็จ</button>
        ))}

        {/* ── coach ── */}
        <div className="pq-coach" aria-hidden="true" />
        <div className="pq-bubble pq-coach-bubble" key={`c${judge?.id ?? 0}`}>
          <b>{coachTitle}</b><span>{coachBody}</span><IcoHeartSmall />
        </div>

        {/* ── judge effects ── */}
        <div className="pq-fx">
          {combo >= 5 && combo % 5 === 0 && judge?.grade !== 'miss' && <div key={`k${combo}`} className="pq-ribbon pq-combo-fx">COMBO x{combo}</div>}
          {judge && (
            <div key={`j${judge.id}`} className={`pq-judge ${judge.grade}`}>
              <span className="pq-judge-word">{JUDGE_TEXT[judge.grade]}</span>
              {judge.grade !== 'miss' && <em>+{judge.gained.toLocaleString()}</em>}
              <Sparks />
            </div>
          )}
        </div>
        <div className="pq-popups">{popups.map((p) => <div key={p.id} className="pq-popup">{p.text}</div>)}</div>

        {/* ── pre-start count-in ── */}
        {count && <Countdown key={count.id} n={count.n} beat={count.beat} />}

        {/* ── cat cheerleader ── */}
        <section className="pq-pose-callout" aria-label="ท่าที่กำลังจะมาถึง">
          <div className={`pq-pose-callout-frame${matched ? ' matched' : ''}${beatCheck ? ' beat-hit' : ''}`}>
            {cur ? <PoseFigure target={cur.pose} frame={frame} /> : <span>♫</span>}
            <i style={{ transform: `scale(${0.42 + poseProgress * 0.58})` }} aria-hidden="true" />
          </div>
          <b>{cur ? thaiShort(cur.pose) : 'เตรียมตัว'}</b>
          <span>{cur ? labelEn(cur.pose) : 'Ready'}</span>
          {cur?.challenge === 'perfect' && <em className="pq-challenge-tag">PERFECT CHALLENGE · +150</em>}
        </section>
        <div className="pq-cat-small"><Cat kind={catMood} /></div>
        <div className="pq-bubble pq-cat-bubble" key={`m${combo >= 5}${h.feverOn}`}>
          <b>{catLine}</b><span>{catSub}</span><IcoHeartSmall />
        </div>

        {/* ── live stats ── */}
        <section className="pq-panel pq-live" {...tiltProps}>
          <div><span className="pq-ring flame"><IcoFlame /></span><p><b>{Math.round(roundKcal)}</b><small>kcal</small></p></div>
          <div>
            <span className="pq-ring heart" style={heartOk ? { animationDuration: `${Math.max(0.45, Math.min(1.6, 60 / (hr.bpm ?? 75))).toFixed(2)}s` } : undefined}><IcoHeart /></span>
            <p><b>{heartOk ? hr.bpm : '--'}</b><small>bpm</small></p>
            <span className="pq-signal" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={n <= bars ? 'on' : ''} />)}</span>
          </div>
        </section>

        {/* ── bottom pose strip ── */}
        <section className="pq-panel pq-strip">
          <div className="pq-reps">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs><linearGradient id="pqRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff5fd8" /><stop offset="1" stopColor="#59e8ff" /></linearGradient></defs>
              <circle cx="60" cy="60" r="52" className="track" />
              <circle cx="60" cy="60" r="52" className="fill" strokeDasharray={`${Math.min(1, (reps % MISSION_REPS || (reps ? MISSION_REPS : 0)) / MISSION_REPS) * 326.7} 326.7`} />
            </svg>
            <b>{reps}</b><small>REPS</small>
          </div>
          <div className="pq-tiles">
            <PoseTile note={notes.prev?.pose} frame={frame} />
            <PoseTile note={cur?.pose} frame={frame} active ok={matched} match={notes.match} />
            <PoseTile note={notes.next?.pose} frame={frame} />
          </div>
          <div className="pq-pose-name">
            {cur ? (
              <>
                <b>{thaiShort(cur.pose)}</b>
                <small>({labelEn(cur.pose)})</small>
                <div key={cur.id} className="pq-beat-lane" style={{ ['--beat-delay' as string]: `${-(beatPhase * 60 / bpm).toFixed(3)}s` }} aria-label="ไฟกระพริบแสดงจังหวะ Beat">
                  {[0, 1, 2, 3].map((n) => <i key={n} className={`pq-beat-tick${n === 0 ? ' downbeat' : ''}`} />)}
                  <span className="pq-beat-target" />
                  <span className="pq-beat-runner" />
                  <b className="pq-beat-label">BEAT</b>
                </div>
              </>
            ) : (
              <><b>{h.total ? 'เสร็จแล้ว' : 'เตรียมตัว'}</b><small>(Ready)</small></>
            )}
          </div>
        </section>
        <div className="pq-progress">
          <i style={{ width: `${progress}%` }} />
          <Star at={50} on={progress >= 50} /><Star at={80} on={progress >= 80} />
        </div>
        <button type="button" className="pq-round-btn pq-cam" aria-label="ถ่ายภาพ" title="ถ่ายภาพ" onClick={snapshot}><IcoCamera /></button>
        <button type="button" className="pq-round-btn pq-gear" aria-label="ตั้งค่า" title="ตั้งค่า" onClick={onOpenSettings}><IcoGear /></button>
        <button type="button" className="pq-round-btn pq-quit" aria-label="ออกจากเกม" title="ออกจากเกม" onClick={onQuit}><IcoClose /></button>
      </div>
    </div>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

function Achievement({ title, sub, done, icon }: { title: string; sub: string; done: boolean; icon: ReactNode }) {
  return (
    <div className={`pq-ach-row${done ? ' done' : ''}`}>
      <span className="pq-ico-badge big">{icon}</span>
      <p><b>{title}</b><small>{sub}</small></p>
      {done ? <span className="pq-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span> : <span className="pq-circle" />}
    </div>
  );
}

function PoseTile({ note, frame, active, ok, match = 0 }: { note?: NoteTarget; frame: 0 | 1; active?: boolean; ok?: boolean; match?: number }) {
  return (
    <div className={`pq-tile${active ? ' active' : ''}${ok ? ' ok' : ''}`}>
      {note && <PoseFigure target={note} frame={frame} />}
      {active && <span className="pq-match"><i style={{ width: `${Math.round(match * 100)}%` }} /></span>}
    </div>
  );
}

/** Same stick-figure maths as the Phaser icon, as SVG. */
const PoseFigure = memo(function PoseFigure({ target, frame }: { target: NoteTarget; frame: 0 | 1 }) {
  const icon = noteIcon(target, frame);
  const s = 100 / 2.4;
  const flip = CAMERA_CONFIG.mirror ? 1 : -1;
  type Pt = [number, number];
  const P = (p: Pt) => `${(50 + p[0] * s * flip).toFixed(1)},${(56 + p[1] * s).toFixed(1)}`;
  const j = icon.joints;
  const hip: Pt = [(j.lh[0] + j.rh[0]) / 2, (j.lh[1] + j.rh[1]) / 2];
  const head = P(icon.head as Pt).split(',');
  const lines: Pt[][] = [
    [j.ls, icon.neck, j.rs], [j.ls, j.le, j.lw], [j.rs, j.re, j.rw], [icon.neck, hip], [j.lh, j.rh], [j.lh, j.lk, j.la], [j.rh, j.rk, j.ra],
  ] as Pt[][];
  return (
    <svg viewBox="0 0 100 100" className="pq-figure" aria-hidden="true">
      {lines.map((l, i) => <polyline key={i} points={l.map(P).join(' ')} />)}
      <circle cx={head[0]} cy={head[1]} r={0.17 * s} />
    </svg>
  );
});

/** Big neon count-in shown before the song starts (n = 0 → "GO!"). */
function Countdown({ n, beat }: { n: number; beat: number }) {
  const go = n === 0;
  return (
    <div className={`pq-count${go ? ' go' : ''}`} style={{ ['--cbeat' as string]: `${Math.max(0.4, beat).toFixed(3)}s` }} aria-live="assertive">
      <div className="pq-count-veil" />
      <div className="pq-count-orb">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <linearGradient id="pqCountRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#59e8ff" /><stop offset=".55" stopColor="#a07aff" /><stop offset="1" stopColor="#ff5fd8" /></linearGradient>
          </defs>
          <circle cx="120" cy="120" r="104" className="halo" />
          <circle cx="120" cy="120" r="104" className="ring" />
          <circle cx="120" cy="120" r="84" className="inner" />
        </svg>
        <b key={n}>{go ? 'GO!' : n}</b>
      </div>
      <p>{go ? 'เริ่มเลย!' : 'เตรียมตัวให้พร้อม'}</p>
      {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={`pq-count-spark c${i}`} />)}
    </div>
  );
}

function Star({ at, on }: { at: number; on: boolean }) {
  return <svg className={`pq-pstar${on ? ' on' : ''}`} style={{ left: `${at}%` }} viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>;
}

function Sparks() {
  return <>{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className={`pq-spark s${n}`} />)}</>;
}

function Decor() {
  return (
    <div className="pq-decor" aria-hidden="true">
      <i className="shard a" /><i className="shard b" /><i className="shard c" /><i className="shard d" /><i className="shard e" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <i key={n} className={`twinkle t${n}`} />)}
    </div>
  );
}

/* ───────────────────────── cat mascot (SVG) ───────────────────────── */

type CatKind = 'idle' | 'happy' | 'perfect' | 'cheer' | 'excited' | 'love' | 'sad' | 'angry' | 'sleep' | 'big';
function Cat({ kind = 'happy' }: { kind?: CatKind }) {
  return <img className="pq-cat" src={`/assets/gameplay/cats/${kind}.webp`} alt="" draggable={false} />;
}

/* ───────────────────────── icons ───────────────────────── */

const svgProps = { viewBox: '0 0 24 24', 'aria-hidden': true } as const;
const IcoStar = () => <svg {...svgProps}><path fill="#ffd54a" stroke="#ff9f1c" strokeWidth="1.2" strokeLinejoin="round" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>;
const IcoStopwatch = () => <svg {...svgProps} fill="none" stroke="#eaf6ff" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5V9M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5" /></svg>;
const IcoFlame = () => <svg {...svgProps}><defs><linearGradient id="pqFl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd0f2" /><stop offset="1" stopColor="#ff3fb8" /></linearGradient></defs><path fill="url(#pqFl)" d="M12.5 2c.6 3.2-1.2 4.7-2.8 6.5C8 10.4 6.5 12 6.5 14.8A5.5 5.5 0 0 0 12 20.5a5.5 5.5 0 0 0 5.5-5.7c0-2.2-1-3.6-2-4.8-.2 1.2-.8 2-1.7 2.3.7-3.2-.2-6.5-1.3-10.3z" /></svg>;
const IcoHeart = () => <svg {...svgProps}><path fill="#ff7ad9" stroke="#ffd6f4" strokeWidth="1" d="M12 21s-8-4.9-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6.1-8 11-8 11z" /></svg>;
const IcoHeartSmall = () => <svg viewBox="0 0 24 24" className="pq-bubble-heart" aria-hidden="true"><path fill="#ff7ad9" d="M12 21s-8-4.9-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6.1-8 11-8 11z" /></svg>;
const IcoCrown = () => <svg {...svgProps}><path fill="#ffc83d" stroke="#ff9f1c" strokeWidth="1" strokeLinejoin="round" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>;
const IcoTrophy = () => <svg {...svgProps}><path fill="#ffc83d" stroke="#ff9f1c" strokeWidth="1" strokeLinejoin="round" d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3.5c0 3 1.5 4.5 3.7 4.8M17 5h3.5c0 3-1.5 4.5-3.7 4.8M10.5 14h3v3h2.5v3h-8v-3h2.5z" /></svg>;
const IcoClose = () => <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const IcoShuffle = () => <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h4l10 10h4M3 17h4l2-2M14 9l3-2h4M18 4l3 3-3 3M18 14l3 3-3 3" /></svg>;
const IcoPlus = () => <svg {...svgProps} fill="#d9f6ff"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>;
const IcoShield = () => <svg {...svgProps} fill="none" stroke="#d9f6ff" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" /><path d="M12 8l1.5 3 3.3.5-2.4 2.3.6 3.2L12 15.4l-3 1.6.6-3.2L7.2 11.5 10.5 11z" fill="#d9f6ff" /></svg>;
const IcoMedal = () => <svg {...svgProps} fill="none" stroke="#d9f6ff" strokeWidth="1.8" strokeLinejoin="round"><circle cx="12" cy="14" r="6" /><path d="M8 3l4 6 4-6M12 11l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 13.300l2-.3z" /></svg>;
const IcoCamera = () => <svg {...svgProps} fill="none" stroke="#eaf6ff" strokeWidth="1.9" strokeLinejoin="round"><path d="M3 8h4l1.5-2.5h7L17 8h4v11H3z" /><circle cx="12" cy="13.5" r="3.8" /></svg>;
const IcoGear = () => <svg {...svgProps} fill="none" stroke="#eaf6ff" strokeWidth="1.9" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M10.3 2.8h3.4l.5 2.4 1.8.8 2.1-1.3 2.4 2.4-1.3 2.1.8 1.8 2.4.5v3.4l-2.4.5-.8 1.8 1.3 2.1-2.4 2.4-2.100-1.300-1.800.8-.5 2.4h-3.400l-.5-2.400-1.800-.8-2.100 1.300-2.400-2.400 1.300-2.100-.8-1.800-2.400-.5v-3.400l2.400-.5.8-1.800-1.300-2.100 2.400-2.400 2.100 1.300 1.800-.8z" /></svg>;
