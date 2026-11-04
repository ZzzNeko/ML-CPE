import assert from 'node:assert/strict';
import {
  getAchievements,
  getWeeklyProgress,
  levelProgress,
  loadPlayerProfile,
  savePlayerResult,
} from '../src/ui/playerProfile.ts';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = { dispatchEvent: () => true };

const legacy = {
  version: 1,
  playerId: 'legacy',
  totalScore: 2500,
  gamesPlayed: 2,
  recentSessions: [],
};
storage.set('fitquest-player-profile-v1', JSON.stringify(legacy));
const migrated = loadPlayerProfile();
assert.equal(migrated.version, 2);
assert.equal(migrated.totalXp, 250, 'legacy profiles derive XP from their recorded score');
assert.deepEqual(levelProgress(migrated), { level: 1, xp: 250, xpToNext: 800 });

storage.clear();
const now = Date.now();
const profile = {
  ...loadPlayerProfile(),
  recentSessions: [
    { playedAt: new Date(now - 1000).toISOString(), score: 1200, accuracy: 80, durationSeconds: 900, reps: 35, maxCombo: 22 },
    { playedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), score: 500, accuracy: 50, durationSeconds: 600, reps: 20, maxCombo: 8 },
  ],
};
assert.deepEqual(getWeeklyProgress(profile, now), { sessions: 1, reps: 35, seconds: 900 });

savePlayerResult({ score: 8050, accuracy: 90, timePlayed: 120, reps: 12, maxCombo: 25 });
const saved = loadPlayerProfile();
assert.equal(saved.totalXp, 805, 'XP accrues at one XP per ten score points');
assert.deepEqual(levelProgress(saved), { level: 2, xp: 5, xpToNext: 800 });
assert.ok(getAchievements(saved).some((achievement) => achievement.id === 'first-session' && achievement.progress === 1));
assert.ok(getAchievements(saved).some((achievement) => achievement.id === 'score-5000' && achievement.progress === 8050));
console.log('PLAYER PROGRESS OK (legacy migration, XP levels, weekly goals, and achievements)');
