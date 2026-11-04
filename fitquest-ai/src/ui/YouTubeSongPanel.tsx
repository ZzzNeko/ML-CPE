import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { estimateTempoFromTaps, getYouTubeRhythmAnalysis, isYouTubeEnded, loadBuiltInSong, loadSavedYouTubeSong, loadYouTubeSong, resetYouTubePlayback, saveBuiltInSong, saveYouTubeSong, setYouTubeClock, setYouTubeDuration, setYouTubeEnded, setYouTubeRhythmAnalysis, setYouTubeTempo, youtubeVideoId, type YouTubeSongConfig } from '../game/rhythm/youtubeSong';
import type { BeatAnalysis } from '../game/rhythm/youtubeBeatDetection';
import { loadSettings, saveSettings } from './settings';
import { levelProgress, loadPlayerProfile } from './playerProfile';
import { StarIcon } from './MainMenu';
import './song-selection.css';

type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
interface BuiltInTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  durationSeconds: number;
  difficulty: Difficulty;
  art: string;
  description: string;
}

interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
}

interface YouTubeEvent {
  target: YouTubePlayer;
  data: number;
}

interface YouTubeApi {
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number>;
      events: {
        onReady: (event: YouTubeEvent) => void;
        onStateChange: (event: YouTubeEvent) => void;
        onError: (event: YouTubeEvent) => void;
        onAutoplayBlocked?: () => void;
      };

    },
  ) => YouTubePlayer;
}

function isYouTubePlayer(player: YouTubePlayer | null): player is YouTubePlayer {
  return !!player
    && typeof player.playVideo === 'function'
    && typeof player.pauseVideo === 'function'
    && typeof player.seekTo === 'function'
    && typeof player.destroy === 'function'
    && typeof player.getCurrentTime === 'function'
    && typeof player.getDuration === 'function'
    && typeof player.getPlayerState === 'function'
    && typeof player.setVolume === 'function';
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const TRACKS: BuiltInTrack[] = [
  { id: 'neon-steps', title: 'Neon Steps', artist: 'FitQuest Original', bpm: 120, durationSeconds: 135, difficulty: 'normal', art: '/assets/fitquest-mascot.webp', description: 'ก้าวไปพร้อมกับจังหวะสุดมันส์ เผาผลาญแคลอรีไปด้วยกัน!' },
  { id: 'pink-pulse', title: 'Pink Pulse', artist: 'Airi', bpm: 128, durationSeconds: 162, difficulty: 'hard', art: '/assets/gameplay/cats/excited.webp', description: 'ปล่อยพลังไปกับบีตสีชมพู จังหวะเร็วที่ท้าทายความคล่องตัวของคุณ' },
  { id: 'star-jump', title: 'Star Jump', artist: 'Kira', bpm: 110, durationSeconds: 128, difficulty: 'easy', art: '/assets/gameplay/cats/happy.webp', description: 'เริ่มต้นอย่างสนุกสนาน ขยับตามจังหวะดาวและสะสมพลังบวกทุกก้าว' },
  { id: 'power-beat', title: 'Power Beat', artist: 'FitQuest Original', bpm: 140, durationSeconds: 180, difficulty: 'expert', art: '/assets/gameplay/cats/big.webp', description: 'ท้าทายขีดจำกัดด้วยจังหวะทรงพลัง สำหรับผู้เล่นที่พร้อมลุย' },
  { id: 'moonlight-run', title: 'Moonlight Run', artist: 'Mika', bpm: 100, durationSeconds: 150, difficulty: 'normal', art: '/assets/gameplay/cats/idle.webp', description: 'เคลื่อนไหวอย่างลื่นไหลในจังหวะที่พอดีกับคุณ' },
];

const FILTERS: Array<{ id: 'all' | Difficulty; label: string; icon: string }> = [
  { id: 'all', label: 'ทั้งหมด', icon: '♫' },
  { id: 'easy', label: 'ง่าย', icon: '★' },
  { id: 'normal', label: 'ปกติ', icon: '★' },
  { id: 'hard', label: 'ยาก', icon: '★' },
  { id: 'expert', label: 'ผู้เชี่ยวชาญ', icon: '♛' },
];

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  const promise = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
      ?? document.createElement('script');
    let timeout = 0;
    const previousReady = window.onYouTubeIframeAPIReady;
    const finish = () => {
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube Player API did not initialize.'));
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      finish();
    };
    timeout = window.setTimeout(() => reject(new Error('YouTube Player API timed out.')), 15000);
    script.addEventListener('error', () => reject(new Error('YouTube Player API could not be loaded.')), { once: true });

    if (!script.src) {
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    youtubeApiPromise = null;
    throw error;
  });
  youtubeApiPromise = promise;
  return promise;
}

const clockLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const difficultyLabel: Record<Difficulty, string> = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD', expert: 'EXPERT' };

interface Props {
  open: boolean;
  gameplay: boolean;
  onStart: () => void;
  onClose: () => void;
}

export function YouTubeSongPanel({ open, gameplay, onStart, onClose }: Props) {
  const profile = loadPlayerProfile();
  const { level, xp } = levelProgress(profile);
  const savedYouTube = loadSavedYouTubeSong();
  const activeYouTube = loadYouTubeSong();
  const savedBuiltIn = loadBuiltInSong();
  const [youtubeSong, setYoutubeSong] = useState<YouTubeSongConfig | null>(savedYouTube);
  const [selectedId, setSelectedId] = useState(activeYouTube ? 'youtube' : savedBuiltIn?.id ?? TRACKS[0].id);
  const [filter, setFilter] = useState<'all' | Difficulty>('all');
  const [sortOrder, setSortOrder] = useState<'recent' | 'bpm' | 'title'>('recent');
  const [query, setQuery] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState(savedYouTube ? `https://youtu.be/${savedYouTube.videoId}` : '');
  const [youtubeError, setYoutubeError] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState('วางลิงก์ YouTube เพื่อเพิ่มเพลง');
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeFormOpen, setYoutubeFormOpen] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [tempoTaps, setTempoTaps] = useState<number[]>([]);
  const [tempoReady, setTempoReady] = useState(() => !!activeYouTube && !!getYouTubeRhythmAnalysis(activeYouTube.videoId));
  const [tempoConfidence, setTempoConfidence] = useState(() =>
    activeYouTube ? getYouTubeRhythmAnalysis(activeYouTube.videoId)?.confidence ?? 0 : 0,
  );
  const [beatAnalysis, setBeatAnalysis] = useState<BeatAnalysis | null>(
    () => activeYouTube ? getYouTubeRhythmAnalysis(activeYouTube.videoId) : null,
  );
  const [audioMatched, setAudioMatched] = useState(false);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [volumeSettings, setVolumeSettings] = useState(() => loadSettings());
  const overlayRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const startedRef = useRef(false);
  const autoplayBlockedRef = useRef(false);
  const selectedVideoId = youtubeSong?.videoId ?? null;
  const selectedIsYoutube = selectedId === 'youtube' && youtubeSong !== null;
  const selectedTrack = TRACKS.find((track) => track.id === selectedId) ?? TRACKS[0];
  const title = selectedIsYoutube ? 'YouTube Mix' : selectedTrack.title;
  const artist = selectedIsYoutube ? 'เพลงที่เลือก' : selectedTrack.artist;
  const bpm = selectedIsYoutube ? (tempoReady ? youtubeSong.bpm : undefined) : selectedTrack.bpm;
  const duration = selectedIsYoutube ? youtubeSong.durationSeconds ?? 0 : selectedTrack.durationSeconds;
  const difficulty: Difficulty = selectedIsYoutube ? 'normal' : selectedTrack.difficulty;
  const description = selectedIsYoutube
    ? 'เลือกวิดีโอ YouTube สำหรับเล่นพร้อมจังหวะท่าทาง เกมจะเริ่มเพลงหลังนับถอยหลังบนหน้า Play'
    : selectedTrack.description;

  useLayoutEffect(() => {
    if (!gameplay || !selectedIsYoutube || !overlayRef.current) return;
    const overlay = overlayRef.current;
    const update = () => {
      const scale = Math.min(window.innerWidth / 1672, window.innerHeight / 941) || 1;
      overlay.style.inset = 'auto';
      overlay.style.left = `${(window.innerWidth - 1672 * scale) / 2 + 18 * scale}px`;
      overlay.style.top = `${(window.innerHeight - 941 * scale) / 2 + 455 * scale}px`;
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
      overlay.style.width = `${346 * scale}px`;
      overlay.style.height = `${178 * scale}px`;
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      overlay.style.removeProperty('inset');
      overlay.style.removeProperty('left');
      overlay.style.removeProperty('top');
      overlay.style.removeProperty('right');
      overlay.style.removeProperty('bottom');
      overlay.style.removeProperty('width');
      overlay.style.removeProperty('height');
    };
  }, [gameplay, selectedIsYoutube]);

  const visibleTracks = TRACKS.filter((track) => {
    const matchesFilter = filter === 'all' || track.difficulty === filter;
    const matchesQuery = `${track.title} ${track.artist} ${track.bpm}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesFilter && matchesQuery;
  });
  if (sortOrder === 'bpm') visibleTracks.sort((a, b) => a.bpm - b.bpm);
  if (sortOrder === 'title') visibleTracks.sort((a, b) => a.title.localeCompare(b.title));
  const showYouTube = youtubeSong && (filter === 'all' || filter === 'normal')
    && `youtube mix ${youtubeSong.videoId} ${youtubeSong.bpm ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());

  useEffect(() => {
    if (open) startedRef.current = false;
  }, [open]);

  useEffect(() => {
    const updateVolumes = (event: Event) => {
      const settings = (event as CustomEvent<ReturnType<typeof loadSettings>>).detail;
      setVolumeSettings(settings ?? loadSettings());
      if (isYouTubePlayer(playerRef.current)) playerRef.current.setVolume(settings?.musicVolume ?? loadSettings().musicVolume);
    };
    window.addEventListener('fitquest:settings-changed', updateVolumes);
    return () => window.removeEventListener('fitquest:settings-changed', updateVolumes);
  }, []);

  useEffect(() => {
    if (selectedIsYoutube && (open || gameplay)) return;
    if (isYouTubePlayer(playerRef.current)) playerRef.current.pauseVideo();
    setYouTubeClock(0, false);
  }, [open, gameplay, selectedIsYoutube]);

  useEffect(() => {
    const config = selectedVideoId ? loadSavedYouTubeSong() : null;
    if (!config || config.videoId !== selectedVideoId || !selectedIsYoutube || !playerHostRef.current) {
      if (isYouTubePlayer(playerRef.current)) playerRef.current.destroy();
      playerRef.current = null;
      setYoutubeReady(false);
      setYouTubeClock(0, false);
      resetYouTubePlayback();
      return;
    }

    let disposed = false;
    let poller = 0;
    setYoutubeReady(false);
    setPreviewPlaying(false);
    setYoutubeStatus('กำลังโหลดตัวเล่น YouTube…');
    void loadYouTubeApi().then((api) => {
      if (disposed || !playerHostRef.current) return;
      const player = new api.Player(playerHostRef.current, {
        videoId: config.videoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (event) => {
            if (disposed) return;
            const seconds = event.target.getDuration();
            if (seconds > 0) {
              setYouTubeDuration(seconds);
              setYoutubeSong((current) => current ? { ...current, durationSeconds: Math.round(seconds) } : current);
            }
            event.target.setVolume(loadSettings().musicVolume);
            setYoutubeReady(true);
            autoplayBlockedRef.current = false;
            setAutoplayBlocked(false);
            setYoutubeStatus('พร้อมเล่น');
            poller = window.setInterval(() => {
              const isPlaying = event.target.getPlayerState() === api.PlayerState.PLAYING;
              setYouTubeClock(event.target.getCurrentTime(), isPlaying);
            }, 100);
          },
          onStateChange: (event) => {
            const isPlaying = event.data === api.PlayerState.PLAYING;
            setPreviewPlaying(isPlaying);
            setYouTubeClock(event.target.getCurrentTime(), isPlaying);
            if (isPlaying) {
              autoplayBlockedRef.current = false;
              setAutoplayBlocked(false);
              setYoutubeStatus('กำลังเล่น');
            } else if (event.data === api.PlayerState.ENDED) {
              const duration = event.target.getDuration();
              setYouTubeClock(duration || event.target.getCurrentTime(), false);
              setYouTubeEnded(true);
              setYoutubeStatus('เพลงจบแล้ว');
            } else if (!autoplayBlockedRef.current) {
              setYoutubeStatus('พร้อมเล่น');
            }
            const seconds = event.target.getDuration();
            if (seconds > 0) {
              setYouTubeDuration(seconds);
              setYoutubeSong((current) => current ? { ...current, durationSeconds: Math.round(seconds) } : current);
            }
          },
          onError: (event) => {
            setYoutubeReady(false);
            setYouTubeClock(event.target.getCurrentTime(), false);
            setYouTubeEnded(false);
            setYoutubeStatus('เล่นวิดีโอนี้ไม่ได้ กรุณาตรวจสอบสิทธิ์หรือเลือกเพลงอื่น');
          },
          onAutoplayBlocked: () => {
            autoplayBlockedRef.current = true;
            setAutoplayBlocked(true);
            setYoutubeStatus('เบราว์เซอร์บล็อกการเล่นอัตโนมัติ กรุณากดเล่นในตัวเล่น YouTube');
          },
        },
      });
      playerRef.current = player;
    }).catch((error: unknown) => {
      if (!disposed) {
        setYoutubeStatus('โหลดตัวเล่น YouTube ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่');
        console.error('[YouTubeSongPanel] player initialization failed', error);
      }
    });

    return () => {
      disposed = true;
      window.clearInterval(poller);
      if (isYouTubePlayer(playerRef.current)) playerRef.current.destroy();
      playerRef.current = null;
      setYoutubeReady(false);
      setYouTubeClock(0, false);
      setYouTubeEnded(false);
    };
  }, [selectedVideoId, selectedIsYoutube]);

  useEffect(() => {
    const startYoutube = () => {
      if (!loadYouTubeSong()) return;
      const player = playerRef.current;
      if (!isYouTubePlayer(player)) {
        setYoutubeStatus('ตัวเล่น YouTube ยังไม่พร้อม กรุณาออกแล้วเลือกเพลงอีกครั้ง');
        return;
      }
      setYouTubeEnded(false);
      autoplayBlockedRef.current = false;
      setAutoplayBlocked(false);
      setYoutubeStatus('กำลังเริ่มเพลง…');
      player.seekTo(0, true);
      player.playVideo();
    };
    window.addEventListener('fitquest:youtube-start', startYoutube);
    return () => window.removeEventListener('fitquest:youtube-start', startYoutube);
  }, []);

  const selectBuiltIn = (track: BuiltInTrack) => {
    setSelectedId(track.id);
    saveBuiltInSong({ id: track.id, bpm: track.bpm, durationSeconds: track.durationSeconds });
  };

  const selectYouTube = () => {
    if (!youtubeSong) return;
    setSelectedId('youtube');
    const analysis = getYouTubeRhythmAnalysis(youtubeSong.videoId);
    const averageBpm = analysis?.segments.length
      ? Math.round(analysis.segments.reduce((sum, segment) => sum + segment.bpm * (segment.endSeconds - segment.startSeconds), 0)
        / analysis.segments.reduce((sum, segment) => sum + segment.endSeconds - segment.startSeconds, 0))
      : undefined;
    const config = analysis
      ? { ...youtubeSong, bpm: averageBpm, beatOffsetSeconds: 0 }
      : { ...youtubeSong, bpm: undefined, beatOffsetSeconds: undefined };
    saveYouTubeSong(config);
    setYoutubeSong(config);
    setTempoTaps([]);
    if (analysis && averageBpm) setYouTubeTempo(averageBpm, 0);
    setTempoReady(!!analysis);
    setTempoConfidence(analysis?.confidence ?? 0);
    setBeatAnalysis(analysis);
    setAudioMatched(false);
    setYoutubeError('');
  };

  const addYouTubeSong = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const videoId = youtubeVideoId(youtubeUrl);
    if (!videoId) {
      setYoutubeError('ลิงก์ไม่ถูกต้อง กรุณาวาง URL หรือ Video ID ของ YouTube');
      return;
    }
    const config: YouTubeSongConfig = { videoId };
    saveYouTubeSong(config);
    setYoutubeSong(config);
    setSelectedId('youtube');
    setTempoTaps([]);
    setTempoReady(false);
    setTempoConfidence(0);
    setBeatAnalysis(null);
    setAudioMatched(false);
    setYoutubeError('');
    setYoutubeStatus('กำลังโหลดตัวเล่น YouTube…');
  };

  const startYouTubePreview = () => {
    if (!isYouTubePlayer(playerRef.current) || !youtubeReady) {
      setYoutubeError('ตัวเล่น YouTube ยังไม่พร้อม กรุณารอสักครู่');
      return;
    }
    if (playerRef.current.getPlayerState() === window.YT?.PlayerState.PLAYING) {
      playerRef.current.pauseVideo();
      return;
    }
    if (isYouTubeEnded()) {
      playerRef.current.seekTo(0, true);
      resetYouTubePlayback();
    }
    playerRef.current.setVolume(loadSettings().musicVolume);
    playerRef.current.playVideo();
    setYoutubeError('');
  };

  const tapYouTubeTempo = () => {
    if (!isYouTubePlayer(playerRef.current) || !youtubeReady) {
      setYoutubeError('ตัวเล่น YouTube ยังไม่พร้อม กรุณารอสักครู่');
      return;
    }
    if (playerRef.current.getPlayerState() !== window.YT?.PlayerState.PLAYING) {
      setYoutubeError('กดเล่นตัวอย่างก่อน แล้วแตะปุ่มตามจังหวะเพลง');
      return;
    }
    if (tempoReady && youtubeSong) {
      setYouTubeRhythmAnalysis(youtubeSong.videoId, null);
      setBeatAnalysis(null);
      setAudioMatched(false);
      const config = { ...youtubeSong, bpm: undefined, beatOffsetSeconds: undefined };
      saveYouTubeSong(config);
      setYoutubeSong(config);
      setTempoTaps([]);
      setTempoReady(false);
      setTempoConfidence(0);
      setYoutubeError('');
      return;
    }
    const time = playerRef.current.getCurrentTime();
    const nextTaps = [...tempoTaps, time];
    if (nextTaps.length < 8) {
      setTempoTaps(nextTaps);
      setYoutubeError('');
      return;
    }
    const tempo = estimateTempoFromTaps(nextTaps);
    if (!tempo || !youtubeSong) {
      setTempoTaps([]);
      setYoutubeError('จับจังหวะไม่สำเร็จ ลองแตะให้สม่ำเสมออีกครั้ง');
      return;
    }
    setTempoConfidence(tempo.confidence);
    if (tempo.confidence < 0.55) {
      setTempoTaps([]);
      setYoutubeError('จังหวะที่แตะยังไม่สม่ำเสมอพอ ลองจับใหม่อีกครั้ง');
      return;
    }
    setYouTubeTempo(tempo.bpm, tempo.beatOffsetSeconds);
    setYouTubeRhythmAnalysis(youtubeSong.videoId, null);
    setBeatAnalysis(null);
    setAudioMatched(false);
    setYoutubeSong((current) => current ? {
      ...current,
      bpm: tempo.bpm,
      beatOffsetSeconds: tempo.beatOffsetSeconds,
    } : current);
    setTempoTaps(nextTaps);
    setTempoReady(true);
    setYoutubeError('');
  };

  const analyzeYouTubeCompanionAudio = async (file: File) => {
    if (!youtubeSong) return;
    setAnalyzingAudio(true);
    setYoutubeError('');
    setAudioMatched(false);
    let context: AudioContext | undefined;
    let worker: Worker | undefined;
    try {
      if (file.type && !file.type.startsWith('audio/')) {
        throw new Error('กรุณาเลือกไฟล์เสียงที่รองรับ');
      }
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const samples = decoded.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
      }
      worker = new Worker(new URL('../game/rhythm/youtubeBeatWorker.ts', import.meta.url), { type: 'module' });
      const response = await new Promise<{ analysis?: BeatAnalysis; error?: string }>((resolve, reject) => {
        if (!worker) {
          reject(new Error('Audio analysis worker could not be created.'));
          return;
        }
        worker.onmessage = (event: MessageEvent<{ analysis?: BeatAnalysis; error?: string }>) => resolve(event.data);
        worker.onerror = () => reject(new Error('Audio analysis worker failed.'));
        worker.postMessage({ samples: mono.buffer, sampleRate: decoded.sampleRate }, [mono.buffer]);
      });
      if (!response.analysis) throw new Error(response.error ?? 'ไม่สามารถวิเคราะห์ไฟล์เสียงได้');
      if (response.analysis.confidence < 0.12 || response.analysis.beats.length < 8) {
        setTempoConfidence(response.analysis.confidence);
        setTempoReady(false);
        setYoutubeError('ตรวจจับจังหวะได้ไม่มั่นใจพอ ลองไฟล์เสียงที่ตรงกับวิดีโอ หรือใช้แตะจับจังหวะเป็นระบบสำรอง');
        return;
      }
      const weightedTempo = response.analysis.segments.reduce(
        (sum, segment) => sum + segment.bpm * (segment.endSeconds - segment.startSeconds),
        0,
      );
      const coveredSeconds = response.analysis.segments.reduce(
        (sum, segment) => sum + segment.endSeconds - segment.startSeconds,
        0,
      );
      const bpm = Math.max(40, Math.min(220, Math.round(weightedTempo / Math.max(1, coveredSeconds))));
      setYouTubeRhythmAnalysis(youtubeSong.videoId, response.analysis);
      setBeatAnalysis(response.analysis);
      setYouTubeTempo(bpm, 0);
      setYoutubeSong((current) => current ? { ...current, bpm, beatOffsetSeconds: 0 } : current);
      setTempoConfidence(response.analysis.confidence);
      setTempoReady(true);
      setYoutubeError('');
    } catch (error) {
      console.error('[YouTubeSongPanel] companion audio analysis failed', error);
      setYoutubeError(error instanceof Error ? error.message : 'วิเคราะห์ไฟล์เสียงไม่สำเร็จ');
    } finally {
      worker?.terminate();
      if (context && context.state !== 'closed') await context.close();
      setAnalyzingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const adjustYouTubeOffset = (deltaSeconds: number) => {
    if (!youtubeSong?.bpm) return;
    const beat = 60 / youtubeSong.bpm;
    const current = youtubeSong.beatOffsetSeconds ?? 0;
    const offset = beatAnalysis
      ? Math.max(-2, Math.min(2, current + deltaSeconds))
      : ((current + deltaSeconds) % beat + beat) % beat;
    setYouTubeTempo(youtubeSong.bpm, offset);
    setYoutubeSong((currentSong) => currentSong ? { ...currentSong, beatOffsetSeconds: offset } : currentSong);
  };

  const resumeYouTube = () => {
    if (!isYouTubePlayer(playerRef.current)) {
      setYoutubeStatus('ตัวเล่นเพลงยังไม่พร้อม กรุณาออกแล้วเลือกเพลงอีกครั้ง');
      setAutoplayBlocked(false);
      return;
    }
    setYouTubeEnded(false);
    autoplayBlockedRef.current = false;
    setAutoplayBlocked(false);
    setYoutubeStatus('กำลังเริ่มเพลง…');
    playerRef.current.playVideo();
  };

  const changeVolume = (key: 'musicVolume' | 'effectVolume', value: number) => {
    const updated = { ...loadSettings(), [key]: value };
    setVolumeSettings(updated);
    saveSettings(updated);
  };
  const begin = () => {
    if (!open || startedRef.current) return;
    if (selectedIsYoutube && (!isYouTubePlayer(playerRef.current) || !youtubeReady)) {
      setYoutubeError('ตัวเล่น YouTube ยังไม่พร้อม กรุณารอสักครู่แล้วลองอีกครั้ง');
      return;
    }
    if (selectedIsYoutube) {
      if ((!tempoReady || !youtubeSong.bpm) || (beatAnalysis && !audioMatched) || !youtubeSong.durationSeconds) {
        setYoutubeError(beatAnalysis && !audioMatched
          ? 'โปรดยืนยันว่าไฟล์เสียงที่วิเคราะห์ตรงกับวิดีโอและเริ่มต้นเวลาเดียวกัน'
          : 'วิเคราะห์ไฟล์เสียงที่ตรงกับวิดีโอ หรือเล่นตัวอย่างแล้วแตะตามจังหวะ 8 ครั้ง');
        return;
      }
      if (!isYouTubePlayer(playerRef.current)) return;
      playerRef.current.pauseVideo();
      playerRef.current.seekTo(0, true);
      setYouTubeClock(0, false);
      setYouTubeEnded(false);
      autoplayBlockedRef.current = false;
      setAutoplayBlocked(false);
    } else {
      selectBuiltIn(selectedTrack);
    }
    startedRef.current = true;
    onStart();
  };

  return (
    <div
      ref={overlayRef}
      className={`fq-song-overlay ${gameplay ? 'is-gameplay' : ''} ${open ? 'is-open' : ''}`}
      aria-labelledby="fq-song-title"
      style={{
        display: open || (gameplay && selectedIsYoutube) ? (gameplay ? 'block' : 'grid') : 'none',
        pointerEvents: open || selectedIsYoutube ? 'auto' : 'none',
      }}
    >
      <section className={`fq-song-screen ${gameplay ? 'is-gameplay' : ''}`}>
        <div className="fq-song-decor" aria-hidden="true">
          <span>♫</span><span>✦</span><span>♪</span><span>✧</span><span>♬</span><span>✦</span>
        </div>
        <header className="fq-song-header">
          <div className="fq-song-brand">
            <img src="/assets/fitquest-logo.webp" alt="FitQuest AI" />
          </div>
          <div className="fq-song-heading">
            <h1 id="fq-song-title"><span aria-hidden="true">♫</span> เลือกเพลง</h1>
            <p>เลือกจังหวะที่ใช่ แล้วเริ่มออกกำลังกาย!</p>
          </div>
          <div className="fq-song-profile">
            <img src="/assets/gameplay/cats/idle.webp" alt="" />
            <div><strong>{profile.displayName}</strong><span>Lv. {level} · {xp} / 800 XP</span></div>
          </div>
        </header>

        <div className="fq-song-content">
          <aside className="fq-song-library">
            <div className="fq-song-filters" role="group" aria-label="กรองเพลงตามระดับความยาก">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            <div className="fq-song-tools">
              <label className="fq-song-search"><span aria-hidden="true">⌕</span><input aria-label="ค้นหาเพลง" placeholder="ค้นหาเพลง..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <label className="fq-song-sort"><span aria-hidden="true">☷</span><select aria-label="เรียงเพลง" value={sortOrder} onChange={(event) => {
                const value = event.target.value;
                setSortOrder(value === 'bpm' || value === 'title' ? value : 'recent');
              }}><option value="recent">เรียงตาม : ใหม่ล่าสุด</option><option value="bpm">BPM: น้อยไปมาก</option><option value="title">ชื่อเพลง</option></select></label>
            </div>
            <div className="fq-song-list" aria-label="รายการเพลง">
              {visibleTracks.map((track, index) => (
                <button key={track.id} type="button" className={`fq-song-track ${selectedId === track.id ? 'selected' : ''}`} onClick={() => selectBuiltIn(track)} aria-pressed={selectedId === track.id}>
                  <span className="fq-song-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="fq-song-art"><img src={track.art} alt="" /></span>
                  <span className="fq-song-track-copy"><strong>{track.title}</strong><small>{track.artist}</small><span>♫ BPM {track.bpm}</span></span>
                  <span className={`fq-song-difficulty ${track.difficulty}`}>★ {difficultyLabel[track.difficulty]}</span>
                  <span className="fq-song-track-play" aria-hidden="true">▶</span>
                </button>
              ))}
              {showYouTube && youtubeSong && (
                <button type="button" className={`fq-song-track youtube ${selectedIsYoutube ? 'selected' : ''}`} onClick={selectYouTube} aria-pressed={selectedIsYoutube}>
                  <span className="fq-song-number">YT</span>
                  <span className="fq-song-art"><img src={`https://img.youtube.com/vi/${youtubeSong.videoId}/hqdefault.jpg`} alt="" /></span>
                  <span className="fq-song-track-copy"><strong>YouTube Mix</strong><small>วิดีโอที่เลือก</small><span>♫ {selectedIsYoutube && tempoReady ? `BPM ${youtubeSong.bpm}` : 'แตะเพื่อจับจังหวะ'}</span></span>
                  <span className="fq-song-difficulty normal">▶ YOUTUBE</span>
                  <span className="fq-song-track-play" aria-hidden="true">▶</span>
                </button>
              )}
              {visibleTracks.length === 0 && !showYouTube && <p className="fq-song-empty">ไม่พบเพลงที่ตรงกับการค้นหา</p>}
            </div>
            <div className="fq-song-list-footer">
              <span>♫ เพลงพร้อมเล่น</span>
              <button type="button" aria-expanded={youtubeFormOpen} onClick={() => setYoutubeFormOpen((value) => !value)}>
                {youtubeFormOpen ? 'ปิด YouTube' : '＋ YouTube'}
              </button>
              <span>{visibleTracks.length + (showYouTube ? 1 : 0)} เพลง</span>
            </div>
            {youtubeFormOpen && <form className="fq-song-youtube-form" onSubmit={addYouTubeSong}>
              <label className="fq-song-form-title" htmlFor="fq-youtube-url">เพิ่มเพลงจาก YouTube</label>
              <div className="fq-song-url-field">
                <input id="fq-youtube-url" type="url" inputMode="url" placeholder="วางลิงก์ YouTube..." value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} />
                <button type="submit">{youtubeSong ? 'อัปเดต' : 'เพิ่มเพลง'}</button>
              </div>
              {youtubeError && !selectedIsYoutube && <p className="fq-song-error" role="alert">{youtubeError}</p>}
            </form>}
            <div className="fq-song-volumes">
              <label className="fq-song-volume"><span>♫ เพลง</span><input type="range" min="0" max="100" value={volumeSettings.musicVolume} onChange={(event) => changeVolume('musicVolume', Number(event.target.value))} aria-label="ระดับเสียงเพลง" /><b>{volumeSettings.musicVolume}%</b></label>
              <label className="fq-song-volume"><span>✦ เอฟเฟกต์</span><input type="range" min="0" max="100" value={volumeSettings.effectVolume} onChange={(event) => changeVolume('effectVolume', Number(event.target.value))} aria-label="ระดับเสียงเอฟเฟกต์" /><b>{volumeSettings.effectVolume}%</b></label>
            </div>
          </aside>

          <main className="fq-song-details">
            <div className="fq-song-detail-main">
              <div className="fq-song-hero-art">
                {!selectedIsYoutube && <img src={selectedTrack.art} alt="" />}
                {selectedIsYoutube && <img src={`https://img.youtube.com/vi/${youtubeSong.videoId}/hqdefault.jpg`} alt="" />}
                <div className="fq-song-hero-label">{selectedIsYoutube ? 'YOUTUBE' : 'FITQUEST'}<strong>{selectedIsYoutube ? 'MIX' : 'ORIGINAL'}</strong></div>
                <span className="fq-song-art-note" aria-hidden="true">♫</span>
                <div className={`fq-song-video-wrap ${selectedIsYoutube ? 'is-youtube' : ''}`} aria-label="ตัวเล่นเพลงที่เลือก">
                  <div className="fq-song-player-slot" ref={playerHostRef} />
                  {gameplay && autoplayBlocked && <button type="button" className="fq-song-video-status" onClick={resumeYouTube}>แตะเพื่อเริ่มเพลง</button>}
                  {gameplay && !autoplayBlocked && (!youtubeReady || youtubeStatus === 'เล่นวิดีโอนี้ไม่ได้ กรุณาตรวจสอบสิทธิ์หรือเลือกเพลงอื่น') && <div className="fq-song-video-status" role="status">{youtubeStatus}</div>}
                </div>
              </div>
              <div className="fq-song-song-info">
                <h2>{title}</h2>
                <p>{artist}</p>
                <div className="fq-song-rule" />
                <div className="fq-song-meta"><span>♫ BPM {bpm ?? 'แตะเพื่อจับจังหวะ'}</span><span>◷ {duration ? clockLabel(duration) : 'อ่านความยาวอัตโนมัติ'}</span></div>
                <div className="fq-song-rating"><small>ระดับความยาก</small><b>★ {difficultyLabel[difficulty]}</b><span aria-label="ระดับสามดาว">★ ★ <i>☆</i></span></div>
              </div>
            </div>
            <div className="fq-song-description">
              <p>{description}</p>
              <div className="fq-song-waveform" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ height: `${25 + ((index * 37 + 13) % 70)}%` }} />)}</div>
            </div>
            {selectedIsYoutube && <div className="fq-song-youtube-controls">
              <div className="fq-song-tempo-tools">
                <button type="button" className="fq-song-preview" onClick={startYouTubePreview} disabled={!youtubeReady}>
                  {previewPlaying ? 'หยุดตัวอย่าง' : '▶ เล่นตัวอย่าง'}
                </button>
                <button type="button" className="fq-song-analyze" onClick={() => audioInputRef.current?.click()} disabled={!youtubeReady || analyzingAudio}>
                  {analyzingAudio ? 'กำลังวิเคราะห์…' : 'วิเคราะห์ไฟล์เสียง'}
                </button>
                <button type="button" className="fq-song-tap" onClick={tapYouTubeTempo} disabled={!youtubeReady}>
                  {tempoReady ? 'วัดจังหวะใหม่' : `แตะตามจังหวะ (${Math.min(tempoTaps.length, 7)}/8)`}
                </button>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm"
                  hidden
                  aria-label="เลือกไฟล์เสียงสำหรับวิเคราะห์จังหวะ"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void analyzeYouTubeCompanionAudio(file);
                  }}
                />
                <span className={`fq-song-tempo-status ${tempoReady ? 'ready' : ''}`}>
                  {tempoReady && youtubeSong.bpm
                    ? `${beatAnalysis ? `ตรวจพบ ${beatAnalysis.segments.length} ช่วง · ` : ''}${youtubeSong.bpm} BPM · มั่นใจ ${Math.round(tempoConfidence * 100)}%`
                    : tempoConfidence > 0
                      ? `ความมั่นใจ ${Math.round(tempoConfidence * 100)}% · ลองวิเคราะห์ใหม่หรือแตะจังหวะ`
                    : `วิเคราะห์จากไฟล์เสียงที่ตรงกับวิดีโอ หรือแตะ 8 ครั้ง · ${youtubeSong.durationSeconds ? clockLabel(youtubeSong.durationSeconds) : 'กำลังอ่านความยาวเพลง'}`}
                </span>
                {beatAnalysis && <label className="fq-song-analysis-confirm">
                  <input type="checkbox" checked={audioMatched} onChange={(event) => setAudioMatched(event.target.checked)} />
                  <span>ไฟล์เสียงตรงกับวิดีโอและเริ่มที่เวลาเดียวกัน</span>
                </label>}
                {tempoReady && <div className="fq-song-offset-tools" aria-label="ปรับจุดเริ่มจังหวะ">
                  <span>{beatAnalysis ? 'ปรับเวลา' : 'จังหวะคลาด?'}</span>
                  <button type="button" onClick={() => adjustYouTubeOffset(-0.025)} aria-label="เลื่อนจังหวะเร็วขึ้น 25 มิลลิวินาที">−25 ms</button>
                  <button type="button" onClick={() => adjustYouTubeOffset(0.025)} aria-label="เลื่อนจังหวะช้าลง 25 มิลลิวินาที">+25 ms</button>
                  <small>{Math.round((youtubeSong.beatOffsetSeconds ?? 0) * 1000)} ms</small>
                </div>}
              </div>
              <p className="fq-song-analysis-note">ตัวเล่น YouTube ไม่เปิดให้แอปอ่านเสียงดิบ จึงวิเคราะห์จากไฟล์เสียงที่คุณเลือกในอุปกรณ์นี้เท่านั้น</p>
              {youtubeError && <p className="fq-song-error" role="alert">{youtubeError}</p>}
            </div>}
            <div className="fq-song-rewards">
              <strong>✦ รางวัลที่ได้รับ</strong>
              <div><span className="fq-song-xp-icon"><StarIcon /><small>XP</small><b>+50</b></span></div>
            </div>
            <div className="fq-song-actions">
              <button type="button" className="fq-song-cancel" onClick={onClose}>← กลับ</button>
              <button type="button" className="fq-song-start" onClick={begin} disabled={selectedIsYoutube && (!youtubeReady || !tempoReady || (Boolean(beatAnalysis) && !audioMatched) || !duration)}>
                <span aria-hidden="true">▶</span>เริ่มเล่นเพลง<span aria-hidden="true">♫</span>
              </button>
            </div>
          </main>
        </div>
        <div className="fq-song-footer"><span>FITQUEST AI <i>·</i> MOVE WITH THE MUSIC</span><span><i /> CAMERA READY WHEN YOU ARE</span></div>
      </section>
    </div>
  );
}
