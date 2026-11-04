import { useEffect, useState } from 'react';
import { cameraManager } from './ai/CameraManager';
import { poseDetector } from './ai/PoseDetector';
import { GameCanvas } from './ui/GameCanvas';
import { SettingsPanel } from './ui/SettingsPanel';
import { loadSettings, saveSettings, type GameSettings } from './ui/settings';
import { eventBus, GameEvents } from './game/EventBus';
import { savePlayerResult } from './ui/playerProfile';

function App() {
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => () => { poseDetector.dispose(); cameraManager.dispose(); }, []);
  useEffect(() => eventBus.on(GameEvents.GAME_OVER, (result: Parameters<typeof savePlayerResult>[0]) => savePlayerResult(result)), []);

  useEffect(() => {
    let audio: AudioContext | null = null;
    const playUiTick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('button,[role="button"]')) return;
      const volume = loadSettings().uiVolume / 100;
      if (volume <= 0) return;
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audio ??= new Ctor();
        if (audio.state === 'suspended') void audio.resume();
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const now = audio.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(720, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);
        gain.gain.setValueAtTime(Math.max(0.0001, volume * 0.045), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(gain).connect(audio.destination);
        osc.start(now);
        osc.stop(now + 0.055);
      } catch { /* Audio feedback is optional. */ }
    };
    document.addEventListener('pointerdown', playUiTick, true);
    return () => {
      document.removeEventListener('pointerdown', playUiTick, true);
      if (audio) void audio.close().catch(() => {});
    };
  }, []);

  const updateSettings = (next: GameSettings) => { setSettings(next); saveSettings(next); };

  return (
    <div className={`fq-app ${settings.reducedMotion ? '[&_*]:!transition-none [&_*]:!animate-none' : ''}`}>
      <main className="fq-game-shell">
        <GameCanvas onOpenSettings={() => setSettingsOpen(true)} />
      </main>

      {settingsOpen && <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
export default App;
