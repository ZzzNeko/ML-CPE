import { useEffect, useState } from 'react';
import {
  getAchievements,
  getWeeklyProgress,
  levelProgress,
  loadPlayerProfile,
  type PlayerProfile,
} from './playerProfile';

type View = 'stats' | 'achievements';

export function PlayerProgressPanel({ view, onClose }: { view: View; onClose: () => void }) {
  const [profile, setProfile] = useState<PlayerProfile>(loadPlayerProfile);
  const [now] = useState(Date.now);
  useEffect(() => {
    const update = () => setProfile(loadPlayerProfile());
    window.addEventListener('fitquest:profile-updated', update);
    return () => window.removeEventListener('fitquest:profile-updated', update);
  }, []);

  const weekly = getWeeklyProgress(profile, now);
  const level = levelProgress(profile);
  const achievements = getAchievements(profile);
  const completed = achievements.filter((achievement) => achievement.progress >= achievement.target).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <section
        className="fq-fade max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-3xl border p-6 text-white shadow-2xl sm:p-8"
        style={{ borderColor: 'rgba(255,111,220,.45)', background: 'linear-gradient(145deg, rgba(24,18,70,.98), rgba(8,15,45,.98))' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fq-progress-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="fq-label">FITQUEST AI · {view === 'stats' ? 'PLAYER STATS' : 'ACHIEVEMENTS'}</p>
            <h2 id="fq-progress-title" className="fq-serif mt-1 text-3xl">{view === 'stats' ? 'สถิติของฉัน' : 'ความสำเร็จ'}</h2>
          </div>
          <button type="button" className="fq-icon-btn" onClick={onClose} aria-label="ปิดหน้าต่าง">✕</button>
        </header>

        {view === 'stats' ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="เล่นทั้งหมด" value={`${profile.gamesPlayed} รอบ`} />
              <Stat label="คะแนนสูงสุด" value={profile.bestScore.toLocaleString()} />
              <Stat label="ทำท่าทั้งหมด" value={profile.totalReps.toLocaleString()} />
              <Stat label="คอมโบสูงสุด" value={profile.bestCombo} />
            </div>
            <section className="mt-5 rounded-2xl border p-4" style={{ borderColor: 'rgba(111,118,226,.5)', background: 'rgba(9,12,55,.55)' }}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-extrabold">เป้าหมาย 7 วันที่ผ่านมา</h3>
                <span className="text-xs text-cyan-200">อิงจากรอบล่าสุดที่บันทึกในเครื่อง</span>
              </div>
              <Goal label="เล่น 5 รอบ" value={weekly.sessions} target={5} />
              <Goal label="ทำท่า 200 ครั้ง" value={weekly.reps} target={200} />
              <Goal label="ออกกำลังกาย 60 นาที" value={Math.floor(weekly.seconds / 60)} target={60} suffix=" นาที" />
            </section>
            <section className="mt-5">
              <h3 className="mb-3 font-extrabold">ประวัติการเล่นล่าสุด</h3>
              {profile.recentSessions.length ? (
                <ol className="space-y-2">
                  {profile.recentSessions.slice(0, 8).map((session, index) => (
                    <li key={`${session.playedAt}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'rgba(111,118,226,.32)', background: 'rgba(9,12,55,.35)' }}>
                      <span>{new Date(session.playedAt).toLocaleString()}</span>
                      <span className="shrink-0 text-cyan-200">{session.score.toLocaleString()} คะแนน · {session.accuracy}%</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-indigo-200">เล่นเกมสักรอบเพื่อเริ่มบันทึกสถิติ</p>}
            </section>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-cyan-100">ปลดล็อกแล้ว {completed} / {achievements.length} · เลเวล {level.level} ({level.xp} / {level.xpToNext} XP)</p>
            <ul className="space-y-3">
              {achievements.map((achievement) => {
                const done = achievement.progress >= achievement.target;
                const progress = Math.min(100, (achievement.progress / achievement.target) * 100);
                return (
                  <li key={achievement.id} className="rounded-2xl border p-4" style={{ borderColor: done ? 'rgba(93,255,214,.55)' : 'rgba(111,118,226,.38)', background: done ? 'rgba(18,97,100,.25)' : 'rgba(9,12,55,.45)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div><h3 className="font-extrabold">{done ? '✦ ' : '◇ '}{achievement.title}</h3><p className="text-xs text-indigo-100">{achievement.description}</p></div>
                      <span className="shrink-0 text-xs text-cyan-100">{Math.min(achievement.progress, achievement.target).toLocaleString()} / {achievement.target.toLocaleString()}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-950"><i className="block h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${progress}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="mt-6 text-center text-xs text-indigo-200">ข้อมูลบันทึกไว้ในเบราว์เซอร์เครื่องนี้</p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border p-3 text-center" style={{ borderColor: 'rgba(111,118,226,.4)', background: 'rgba(9,12,55,.5)' }}><small className="block text-xs text-indigo-200">{label}</small><strong className="mt-1 block text-lg text-cyan-100">{value}</strong></div>;
}

function Goal({ label, value, target, suffix = '' }: { label: string; value: number; target: number; suffix?: string }) {
  const progress = Math.min(100, (value / target) * 100);
  return <div className="mt-4"><div className="mb-1 flex justify-between gap-3 text-xs"><span>{label}</span><span>{Math.min(value, target).toLocaleString()} / {target.toLocaleString()}{suffix}</span></div><div className="h-2 overflow-hidden rounded-full bg-indigo-950"><i className="block h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${progress}%` }} /></div></div>;
}
