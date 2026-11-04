import { useEffect, useLayoutEffect, useState } from 'react';

interface LoadingScreenProps {
  /** Keep covering the game while true; fades out when it turns false. */
  loading: boolean;
  /** 0‥1 */
  progress: number;
  label?: string;
}

const FADE_MS = 500;

export function LoadingScreen({ loading, progress, label = 'Loading assets…' }: LoadingScreenProps) {
  const [mounted, setMounted] = useState(true);

  // The static splash in index.html covered the page until now; hand over to this one.
  useLayoutEffect(() => { document.getElementById('fq-splash')?.remove(); }, []);

  useEffect(() => {
    if (loading) return;
    const t = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [loading]);

  if (!mounted) return null;
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div className={`fq-loading ${loading ? '' : 'fq-loading-out'}`} role="status" aria-live="polite" aria-busy={loading}>
      <div className="fq-loading-inner">
        <div className="fq-loading-logo">FitQuest <b>AI</b></div>
        <div className="fq-loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${Math.max(6, pct)}%` }} /></div>
        <small>{label} {pct}%</small>
      </div>
    </div>
  );
}
