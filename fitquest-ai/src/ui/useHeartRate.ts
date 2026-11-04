import { useEffect, useState } from 'react';

export interface HeartRate {
  /** Band has reported within the server's online window. */
  online: boolean;
  /** Skin contact detected by the sensor. */
  finger: boolean;
  /** null means there is no fresh, reliable reading. */
  bpm: number | null;
  battery: number | null;
  rssi: number | null;
  /** Timestamp of the latest ESP32 report, in Unix milliseconds. */
  at: number | null;
}

const OFFLINE: HeartRate = {
  online: false, finger: false, bpm: null, battery: null, rssi: null, at: null,
};
const DEVICE = import.meta.env.VITE_HEARTRATE_DEVICE ?? 'fitquest-band-01';
const ENDPOINT = import.meta.env.VITE_HEARTRATE_URL ?? '/api/heartrate';
const MAX_READING_AGE_MS = 15_000;
const MIN_BPM = 30;
const MAX_BPM = 220;

/** Polls the ESP32-backed API; rejects stale, malformed and out-of-range readings. */
export function useHeartRate(intervalMs = 3000): HeartRate {
  const [hr, setHr] = useState<HeartRate>(OFFLINE);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let inFlight = false;

    const load = async () => {
      if (stopped || document.hidden || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 5000);

      try {
        const url = new URL(ENDPOINT, window.location.href);
        url.searchParams.set('device', DEVICE);
        const res = await fetch(url.toString(), {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Heart-rate API returned ${res.status}`);

        const d = (await res.json()) as Partial<HeartRate>;
        const now = Date.now();
        const at = typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : null;
        const fresh = at === null || (at <= now + 5000 && now - at <= MAX_READING_AGE_MS);
        const online = d.online === true && fresh;
        const finger = online && d.finger === true;
        const rawBpm = d.bpm;
        const bpm =
          finger && typeof rawBpm === 'number' && Number.isFinite(rawBpm) &&
          rawBpm >= MIN_BPM && rawBpm <= MAX_BPM
            ? Math.round(rawBpm)
            : null;

        if (!stopped) {
          setHr({
            online,
            finger,
            bpm,
            battery: typeof d.battery === 'number' && Number.isFinite(d.battery) ? d.battery : null,
            rssi: typeof d.rssi === 'number' && Number.isFinite(d.rssi) ? d.rssi : null,
            at,
          });
        }
      } catch {
        if (!stopped) setHr(OFFLINE);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (!document.hidden) void load();
    };

    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return hr;
}
