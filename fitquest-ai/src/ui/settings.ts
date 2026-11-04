export interface GameSettings {
  difficulty: 'easy' | 'normal' | 'hard';
  showCameraPreview: boolean;
  reducedMotion: boolean;
  musicVolume: number;
  effectVolume: number;
  uiVolume: number;
}

const KEY = 'fitquest-settings';

const DEFAULT_SETTINGS: GameSettings = {
  difficulty: 'normal',
  showCameraPreview: true,
  reducedMotion: false,
  musicVolume: 65,
  effectVolume: 75,
  uiVolume: 55,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const volume = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;
    return {
      difficulty: parsed.difficulty === 'easy' || parsed.difficulty === 'hard' ? parsed.difficulty : 'normal',
      showCameraPreview: parsed.showCameraPreview !== false,
      reducedMotion: parsed.reducedMotion === true,
      musicVolume: volume(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume),
      effectVolume: volume(parsed.effectVolume, DEFAULT_SETTINGS.effectVolume),
      uiVolume: volume(parsed.uiVolume, DEFAULT_SETTINGS.uiVolume),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('fitquest:settings-changed', { detail: settings }));
  } catch {
    // Settings still apply for this session if browser storage is unavailable.
  }
}
