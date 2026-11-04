export interface PlayerSession {
  playedAt: string;
  score: number;
  accuracy: number;
  durationSeconds: number;
  reps: number;
  maxCombo: number;
}

export interface PlayerProfile {
  version: 2;
  playerId: string;
  displayName: string;
  createdAt: string;
  gamesPlayed: number;
  totalScore: number;
  totalXp: number;
  bestScore: number;
  bestCombo: number;
  totalReps: number;
  totalWorkoutSeconds: number;
  lastPlayedAt: string | null;
  recentSessions: PlayerSession[];
}

interface StoredPlayerProfile extends Omit<Partial<PlayerProfile>, 'version'> {
  version?: number;
}

const KEY = 'fitquest-player-profile-v1';
const HISTORY_LIMIT = 100;
const XP_PER_LEVEL = 800;
function makeId() {
  try { return 'fq_' + crypto.randomUUID(); }
  catch { return 'fq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }
}
function freshProfile(): PlayerProfile {
  const now = new Date().toISOString();
  return { version: 2, playerId: makeId(), displayName: 'ผู้เล่น', createdAt: now, gamesPlayed: 0, totalScore: 0, totalXp: 0, bestScore: 0, bestCombo: 0, totalReps: 0, totalWorkoutSeconds: 0, lastPlayedAt: null, recentSessions: [] };
}
/** Progress stays in this browser by default; no account or personal details required. */
export function loadPlayerProfile(): PlayerProfile {
  const fallback = freshProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { localStorage.setItem(KEY, JSON.stringify(fallback)); return fallback; }
    const value = JSON.parse(raw) as StoredPlayerProfile;
    if ((value.version !== 1 && value.version !== 2) || typeof value.playerId !== 'string') return fallback;
    const totalScore = finiteNonNegative(value.totalScore);
    return {
      ...fallback,
      playerId: value.playerId,
      displayName: typeof value.displayName === 'string' ? value.displayName.slice(0, 24) : fallback.displayName,
      createdAt: typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) ? value.createdAt : fallback.createdAt,
      gamesPlayed: finiteNonNegative(value.gamesPlayed),
      totalScore,
      bestScore: finiteNonNegative(value.bestScore),
      bestCombo: finiteNonNegative(value.bestCombo),
      totalReps: finiteNonNegative(value.totalReps),
      totalWorkoutSeconds: finiteNonNegative(value.totalWorkoutSeconds),
      lastPlayedAt: typeof value.lastPlayedAt === 'string' && Number.isFinite(Date.parse(value.lastPlayedAt)) ? value.lastPlayedAt : null,
      version: 2,
      totalXp: typeof value.totalXp === 'number' && Number.isFinite(value.totalXp)
        ? finiteNonNegative(value.totalXp)
        : Math.floor(totalScore / 10),
      recentSessions: Array.isArray(value.recentSessions)
        ? value.recentSessions.filter(validSession).slice(0, HISTORY_LIMIT)
        : [],
    };
  } catch { return fallback; }
}
function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function validSession(value: unknown): value is PlayerSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<PlayerSession>;
  return typeof session.playedAt === 'string'
    && Number.isFinite(Date.parse(session.playedAt))
    && [session.score, session.accuracy, session.durationSeconds, session.reps, session.maxCombo]
      .every((field) => typeof field === 'number' && Number.isFinite(field));
}

export function savePlayerResult(result: { score?: number; accuracy?: number; timePlayed?: number; reps?: number; maxCombo?: number }) {
  const profile = loadPlayerProfile();
  const score = Math.max(0, Math.round(Number(result.score) || 0));
  const durationSeconds = Math.max(0, Math.round(Number(result.timePlayed) || 0));
  const session: PlayerSession = { playedAt: new Date().toISOString(), score, accuracy: Math.max(0, Math.min(100, Math.round(Number(result.accuracy) || 0))), durationSeconds, reps: Math.max(0, Math.round(Number(result.reps) || 0)), maxCombo: Math.max(0, Math.round(Number(result.maxCombo) || 0)) };
  profile.gamesPlayed += 1; profile.totalScore += score; profile.totalXp += Math.floor(score / 10); profile.bestScore = Math.max(profile.bestScore, score); profile.bestCombo = Math.max(profile.bestCombo, session.maxCombo); profile.totalReps += session.reps; profile.totalWorkoutSeconds += durationSeconds; profile.lastPlayedAt = session.playedAt; profile.recentSessions = [session, ...profile.recentSessions].slice(0, HISTORY_LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(profile)); window.dispatchEvent(new CustomEvent('fitquest:profile-updated', { detail: profile })); } catch { /* Storage is optional. */ }
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
}

export function getAchievements(profile: PlayerProfile): Achievement[] {
  return [
    { id: 'first-session', title: 'เริ่มต้นการเดินทาง', description: 'เล่นครบ 1 รอบ', progress: profile.gamesPlayed, target: 1 },
    { id: 'ten-sessions', title: 'นักผจญภัย', description: 'เล่นครบ 10 รอบ', progress: profile.gamesPlayed, target: 10 },
    { id: 'first-reps', title: 'ก้าวแรกของความฟิต', description: 'ทำท่าครบ 10 ครั้ง', progress: profile.totalReps, target: 10 },
    { id: 'hundred-reps', title: 'นักสู้สายฟิต', description: 'ทำท่าครบ 100 ครั้ง', progress: profile.totalReps, target: 100 },
    { id: 'combo-20', title: 'จังหวะต่อเนื่อง', description: 'ทำคอมโบสูงสุด 20', progress: profile.bestCombo, target: 20 },
    { id: 'score-5000', title: 'ดาวรุ่ง', description: 'ทำคะแนนต่อรอบ 5,000', progress: profile.bestScore, target: 5000 },
    { id: 'workout-hour', title: 'เวลาเพื่อตัวเอง', description: 'ออกกำลังกายสะสม 60 นาที', progress: Math.floor(profile.totalWorkoutSeconds / 60), target: 60 },
  ];
}

export function getWeeklyProgress(profile: PlayerProfile, now = Date.now()) {
  const since = now - 7 * 24 * 60 * 60 * 1000;
  const sessions = profile.recentSessions.filter((session) => {
    const time = Date.parse(session.playedAt);
    return Number.isFinite(time) && time >= since && time <= now;
  });
  return {
    sessions: sessions.length,
    reps: sessions.reduce((sum, session) => sum + finiteNonNegative(session.reps), 0),
    seconds: sessions.reduce((sum, session) => sum + finiteNonNegative(session.durationSeconds), 0),
  };
}

export function levelProgress(profile: PlayerProfile) {
  const level = Math.floor(profile.totalXp / XP_PER_LEVEL) + 1;
  return { level, xp: profile.totalXp % XP_PER_LEVEL, xpToNext: XP_PER_LEVEL };
}
