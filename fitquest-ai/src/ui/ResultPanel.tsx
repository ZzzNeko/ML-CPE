import { useEffect, useState } from 'react';
import { eventBus, GameEvents } from '../game/EventBus';
import type { ResultData } from '../game/scenes/ResultScene';
import './result-panel.css';

const XP_PER_LEVEL = 800;

/** Rank + mascot mood + Thai headline from overall accuracy. */
function rankFor(accuracy: number) {
  if (accuracy >= 90) return { rank: 'S', cat: 'perfect', title: 'สุดยอดไปเลย!', sub: 'ทำได้เป๊ะเกือบทุกท่า' };
  if (accuracy >= 75) return { rank: 'A', cat: 'cheer', title: 'เยี่ยมมาก!', sub: 'ทำได้ดีมากเลย ต่อไปเราจะไปให้ไกลกว่านี้กัน!' };
  if (accuracy >= 55) return { rank: 'B', cat: 'happy', title: 'ดีมาก!', sub: 'อีกนิดเดียวจะเป๊ะแล้ว สู้ ๆ!' };
  if (accuracy >= 30) return { rank: 'C', cat: 'idle', title: 'ผ่านไปด้วยดี', sub: 'ฝึกอีกหน่อยจะดีขึ้นแน่นอน' };
  return { rank: 'D', cat: 'sad', title: 'ไม่เป็นไรนะ', sub: 'ลองใหม่อีกครั้ง เราเริ่มใหม่ด้วยกัน!' };
}

export function ResultPanel({ visible }: { visible: boolean }) {
  const [result, setResult] = useState<ResultData | null>(null);

  useEffect(() => {
    const offResult = eventBus.on(GameEvents.RESULT_READY, (data: ResultData) => setResult(data));
    const offReady = eventBus.on(GameEvents.SCENE_READY, () => setResult(null));
    return () => { offResult(); offReady(); };
  }, []);

  if (!visible || !result) return null;

  const minutes = Math.floor(result.timePlayed / 60);
  const seconds = result.timePlayed % 60;
  const poseStats = result.poseStats ?? [];
  // List is sorted weakest first; only point at a pose that was asked a few times and is clearly behind.
  const weakest = poseStats.find((p) => p.total >= 2 && p.accuracy < 70);
  const r = rankFor(result.accuracy);
  const xp = Math.floor(result.score / 10);
  const j = result.judgements;

  return (
    <div className="pr-root" role="dialog" aria-label="สรุปผลการเล่น">
      <div className="pr-tint" />
      <i className="pr-shard a" /><i className="pr-shard b" /><i className="pr-shard c" /><i className="pr-shard d" />
      {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className={`pr-twinkle t${n}`} />)}

      <div className="pr-scroll">
        <section className="pr-card">
          <header className="pr-head">
            <img className="pr-logo" src="/assets/fitquest-logo.webp" alt="FitQuest AI" draggable={false} />
            <span className="pr-chip">SESSION COMPLETE</span>
          </header>

          <div className="pr-hero">
            <div className="pr-rank" data-rank={r.rank}>
              <span>{r.rank}</span>
              <small>RANK</small>
            </div>
            <div className="pr-score">
              <small>TOTAL SCORE</small>
              <b>{result.score.toLocaleString()}</b>
              <em>+{xp.toLocaleString()} XP</em>
              <span className="pr-xpbar"><i style={{ width: `${Math.min(100, ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)}%` }} /></span>
            </div>
            <div className="pr-cat"><img src={`/assets/gameplay/cats/${r.cat}.webp`} alt="" draggable={false} /></div>
          </div>

          <div className="pr-bubble">
            <b>{r.title}</b>
            <span>{r.sub}</span>
          </div>

          <dl className="pr-stats">
            <Stat label="REPS" value={result.reps} tone="cyan" />
            <Stat label="ACCURACY" value={`${result.accuracy}%`} tone="pink" />
            <Stat label="TIME" value={`${minutes}:${String(seconds).padStart(2, '0')}`} tone="cyan" />
            <Stat label="MAX COMBO" value={`x${result.maxCombo ?? 0}`} tone="pink" />
          </dl>

          {(j || result.chains || result.fevers !== undefined) && (
            <div className="pr-judge">
              {j && (result.mode === 'PoseRhythm' ? ['perfect', 'great', 'good'] as const : ['perfect', 'great', 'good', 'miss'] as const).map((g) => (
                <span key={g} className={`pr-jchip ${g}`}><b>{g.toUpperCase()}</b><em>{j[g]}</em></span>
              ))}
              {result.chains && result.chains.total > 0 && (
                <span className="pr-jchip info"><b>CHAIN</b><em>{result.chains.completed}/{result.chains.total}</em></span>
              )}
              {result.fevers !== undefined && <span className="pr-jchip info"><b>FEVER</b><em>x{result.fevers}</em></span>}
              {(result.perfectChallenges ?? 0) > 0 && <span className="pr-jchip info"><b>PERFECT CHALLENGE</b><em>{result.perfectChallenges}</em></span>}
            </div>
          )}

          {poseStats.length > 0 && (
            <div className="pr-poses">
              <h3>ความแม่นยำแต่ละท่า</h3>
              <ul>
                {poseStats.map((p) => (
                  <li key={p.id} className={p.accuracy < 50 ? 'low' : ''}>
                    <div><span>{p.label}</span><small>{p.accuracy}% · {p.total}×</small></div>
                    <span className="pr-bar"><i style={{ width: `${p.accuracy}%` }} /></span>
                  </li>
                ))}
              </ul>
              {weakest && <p className="pr-tip">ควรฝึกเพิ่ม: {weakest.label}</p>}
            </div>
          )}

          <div className="pr-actions">
            <button type="button" className="pr-btn primary" onClick={() => eventBus.emit(GameEvents.RESULT_RESTART)}>เล่นอีกครั้ง</button>
            <button type="button" className="pr-btn" onClick={() => eventBus.emit(GameEvents.RESULT_MENU)}>เมนูหลัก</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: 'cyan' | 'pink' }) {
  return (
    <div className={`pr-stat ${tone}`}>
      <dd>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}
