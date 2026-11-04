import { useEffect, useState } from 'react';

/** Main-menu and song-picker art, decoded before the player starts. */
export const MENU_ASSETS = [
  '/assets/fitquest-menu-bg.svg',
  '/assets/fitquest-neon-gym.svg',
  '/assets/fitquest-logo.webp',
  '/assets/fitquest-mascot.webp',
  '/assets/gameplay/cats/idle.webp',
  '/assets/gameplay/cats/excited.webp',
  '/assets/gameplay/cats/happy.webp',
  '/assets/gameplay/cats/big.webp',
  '/assets/gameplay/cats/cheer.webp',
] as const;

const MENU_FONTS = ['800 16px Nunito', '700 16px Nunito', '600 16px Nunito', '700 16px Caveat'];
const MAX_WAIT_MS = 8000; // never trap the player behind the loader on a slow/blocked asset

function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { void img.decode?.().catch(() => undefined).finally(resolve); };
    img.onerror = () => resolve(); // a missing asset shouldn't block the menu
    img.src = src;
  });
}

/**
 * Preloads + decodes the menu art and fonts. `progress` is 0‥1; `ready` flips once
 * everything has settled (or after MAX_WAIT_MS).
 */
export function useAssetPreload() {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tasks: Promise<void>[] = [
      ...MENU_ASSETS.map(loadImage),
      ...MENU_FONTS.map((f) => (document.fonts ? document.fonts.load(f).then(() => undefined, () => undefined) : Promise.resolve())),
    ];
    let done = 0;
    const tick = () => { done += 1; if (!cancelled) setProgress(done / tasks.length); };
    tasks.forEach((t) => void t.then(tick));

    const finish = () => { if (!cancelled) { setProgress(1); setReady(true); } };
    void Promise.all(tasks).then(finish);
    const timeout = window.setTimeout(finish, MAX_WAIT_MS);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, []);

  return { progress, ready };
}
