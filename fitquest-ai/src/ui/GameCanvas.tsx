import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createGame } from '../game/Game';
import { eventBus, GameEvents } from '../game/EventBus';
import { PoseOverlay } from './PoseOverlay';
import { useCamera, useCameraVideo } from './useCamera';
import { usePose } from './usePose';
import { ResultPanel } from './ResultPanel';
import { PlayHud } from './PlayHud';
import { HeartRateBadge } from './HeartRateBadge';
import { MainMenu } from './MainMenu';
import { LoadingScreen } from './LoadingScreen';
import { useAssetPreload } from './useAssetPreload';
import { YouTubeSongPanel } from './YouTubeSongPanel';
import { PlayerProgressPanel } from './PlayerProgressPanel';
import { CnnPoseTestPanel } from './CnnPoseTestPanel';
import { CAMERA_CONFIG } from '../data/gameConfig';
import { playUiClick, playUiHover, startUiAudio } from './uiAudio';
import { loadSettings } from './settings';

interface GameCanvasProps { onOpenSettings: () => void; }

export function GameCanvas({ onOpenSettings }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const videoRef = useCameraVideo();
  const [scene, setScene] = useState<string>('Boot');
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [poseTestOpen, setPoseTestOpen] = useState(false);
  const [progressView, setProgressView] = useState<'stats' | 'achievements' | null>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(() => loadSettings().showCameraPreview);
  const camera = useCamera();
  const assets = useAssetPreload();
  const pose = usePose(camera.isReady);

  useEffect(() => { if (camera.status === 'idle') void camera.start(); }, [camera.status, camera.start]);

  useEffect(() => {
    const onHover = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, [role="button"], a, select')) playUiHover();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, [role="button"], a')) playUiClick();
    };
    document.addEventListener('pointerover', onHover);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('pointerover', onHover); document.removeEventListener('click', onClick); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = () => {
      if (cancelled || !containerRef.current || gameRef.current) return;
      gameRef.current = createGame(containerRef.current);
    };
    const fonts = document.fonts;
    if (!fonts) boot();
    else {
      const loaded = Promise.all([
        fonts.load('400 16px Inter'), fonts.load('500 16px Inter'),
        fonts.load('400 16px "Noto Sans Thai"', 'ก'), fonts.load('500 16px "Noto Sans Thai"', 'ก'),
        fonts.load('300 16px "Cormorant Garamond"'),
      ]);
      void Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 2000))]).then(boot, boot);
    }
    return () => { cancelled = true; gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

  useEffect(() => eventBus.on(GameEvents.SCENE_CHANGED, (key: string) => setScene(key)), []);
  useEffect(() => {
    const update = (event: Event) => {
      const settings = (event as CustomEvent<{ showCameraPreview?: boolean }>).detail;
      if (typeof settings?.showCameraPreview === 'boolean') setShowCameraPreview(settings.showCameraPreview);
    };
    window.addEventListener('fitquest:settings-changed', update);
    return () => window.removeEventListener('fitquest:settings-changed', update);
  }, []);

  const startScene = (key: 'PoseRhythm') => {
    const active = gameRef.current?.scene.getScene('Menu');
    if (active) active.scene.start(key);
  };
  const startPoseRhythm = () => { void startUiAudio(); setSongPickerOpen(true); };

  return (
    <section className="fq-game-screen relative h-full w-full overflow-hidden" style={{ background: 'var(--fq-bg)' }}>
      <div className="absolute inset-0 z-0 overflow-hidden">
        {camera.isReady ? (
          <video ref={videoRef} muted playsInline autoPlay className={`fq-camera-bg h-full w-full ${CAMERA_CONFIG.mirror ? 'scale-x-[-1]' : ''}`} style={{ visibility: showCameraPreview ? 'visible' : 'hidden' }} />
        ) : (
          <div className="flex h-full items-center justify-center text-center" style={{ background: 'var(--fq-bg)' }}>
            <div className="fq-fade max-w-sm px-6">
              <p className="fq-label">Camera</p><p className="fq-serif mt-3 text-3xl">กำลังเปิดกล้อง…</p>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--fq-muted)' }}>อนุญาตการใช้กล้องเพื่อให้ภาพของคุณเป็นพื้นหลังเกม</p>
              {camera.error && <p className="mt-4 text-xs" style={{ color: 'var(--fq-danger)' }}>{camera.error.message}</p>}
              {!camera.isBusy && camera.status !== 'ready' && <button type="button" onClick={() => { camera.reset(); void camera.start(); }} className="fq-btn fq-btn-ghost fq-btn-sm mt-6">เปิดกล้อง</button>}
            </div>
          </div>
        )}
        <div className="fq-vignette" />
        {camera.isReady && showCameraPreview && <PoseOverlay lineWidth={2.5} />}
      </div>

      <div ref={containerRef} className="fq-phaser-layer absolute inset-0 z-10 h-full w-full" />
      {pose.delegate === 'CPU' && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border px-3 py-1 text-[11px] backdrop-blur-md" style={{ borderColor: 'rgba(255,214,140,.35)', background: 'rgba(25,20,36,.82)', color: '#ffe0a6' }}>
          ตรวจจับท่าด้วย CPU — อาจทำงานช้าลง
        </div>
      )}
      {pose.framing && !pose.framing.ready && pose.framing.bodyDetected && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 max-w-[90vw] -translate-x-1/2 rounded-full border px-3 py-1 text-center text-[11px] backdrop-blur-md" style={{ borderColor: 'rgba(255,214,140,.3)', background: 'rgba(25,20,36,.78)', color: '#ffe0a6' }}>
          {pose.framing.message}
        </div>
      )}
      {scene === 'PoseRhythm' && <PlayHud onOpenSettings={onOpenSettings} onQuit={() => eventBus.emit(GameEvents.RHYTHM_QUIT)} />}
      <YouTubeSongPanel
        open={scene === 'Menu' && songPickerOpen}
        gameplay={scene === 'PoseRhythm'}
        onClose={() => setSongPickerOpen(false)}
        onStart={() => { setSongPickerOpen(false); startScene('PoseRhythm'); }}
      />

      <div className={`absolute right-3 top-3 z-30 flex gap-2 sm:right-6 sm:top-5 ${scene === 'Menu' || scene === 'PoseRhythm' ? 'hidden' : ''}`}>
        <IconButton label="Settings" onClick={onOpenSettings}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.7-1.3-1.7-3-2 .8c-.4-.3-.8-.6-1.3-.8L15.8 5h-3.4l-.3 2.2c-.5.2-.9.5-1.3.8l-2-.8-1.7 3 1.7 1.3c-.04.5-.04 1 0 1.5l-1.7 1.3 1.7 3 2-.8c.4.3.8.6 1.3.8l.3 2.2h3.4l.3-2.2c.5-.2.9-.5 1.3-.8l2 .8 1.7-3-1.7-1.3Z" />
        </IconButton>
        {scene === 'PoseRhythm' && <IconButton label="Quit" onClick={() => eventBus.emit(GameEvents.RHYTHM_QUIT)}><path d="M6 6l12 12M18 6 6 18" /></IconButton>}
      </div>

      {scene === 'Menu' && (
        <MainMenu
          onPlay={startPoseRhythm}
          onStats={() => setProgressView('stats')}
          onSettings={onOpenSettings}
          onAchievements={() => setProgressView('achievements')}
          onTestPoses={() => setPoseTestOpen(true)}
        >
          <HeartRateBadge inline />
        </MainMenu>
      )}

      {scene === 'Menu' && poseTestOpen && (
        <CnnPoseTestPanel frame={pose.frame} poseStatus={pose.status} onClose={() => setPoseTestOpen(false)} />
      )}
      <ResultPanel visible={scene === 'Result'} />
      {progressView && <PlayerProgressPanel view={progressView} onClose={() => setProgressView(null)} />}
      <LoadingScreen loading={!assets.ready || scene === 'Boot'} progress={assets.progress} />
      {camera.status === 'error' && <div className="absolute inset-x-0 bottom-0 z-40 border-t px-4 py-2.5 text-center text-xs backdrop-blur-md" style={{ borderColor: 'rgba(196,131,124,.4)', background: 'rgba(32,14,14,.88)', color: '#e8c4bf' }}>{camera.error?.message} {camera.error?.hint}</div>}
      {pose.error && <div role="alert" className="absolute inset-x-0 bottom-0 z-40 border-t px-4 py-2.5 text-center text-xs backdrop-blur-md" style={{ borderColor: 'rgba(196,131,124,.4)', background: 'rgba(32,14,14,.92)', color: '#e8c4bf' }}>{pose.error.message} {pose.error.hint}</div>}
    </section>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="fq-icon-btn" aria-label={label} title={label}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg></button>;
}
