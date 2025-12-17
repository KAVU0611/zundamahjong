import { useCallback, useEffect, useMemo, useRef } from 'react';

type SoundSources = {
  preferred: string;
  fallback?: string;
};

export type SeKey = 'discard' | 'click' | 'win';
export type VoiceKey =
  | 'zunda_pon'
  | 'zunda_chi'
  | 'zunda_kan'
  | 'zunda_riichi'
  | 'zunda_ron'
  | 'zunda_tsumo'
  | 'zunda_tenpai'
  | 'zunda_slow'
  | 'zunda_dora'
  | 'zunda_start';

const SE_SOURCES: Record<SeKey, SoundSources> = {
  discard: { preferred: '/sounds/se/discard.wav', fallback: '/sounds/se/discard.mp3' },
  click: { preferred: '/sounds/se/click.wav', fallback: '/sounds/se/click.mp3' },
  win: { preferred: '/sounds/se/win.wav', fallback: '/sounds/se/win.mp3' },
};

const VOICE_SOURCES: Record<VoiceKey, SoundSources> = {
  zunda_pon: { preferred: '/sounds/voice/zunda_pon.wav' },
  zunda_chi: { preferred: '/sounds/voice/zunda_chi.wav' },
  zunda_kan: { preferred: '/sounds/voice/zunda_kan.wav' },
  zunda_riichi: { preferred: '/sounds/voice/zunda_riichi.wav' },
  zunda_ron: { preferred: '/sounds/voice/zunda_ron.wav' },
  zunda_tsumo: { preferred: '/sounds/voice/zunda_tsumo.wav' },
  zunda_tenpai: { preferred: '/sounds/voice/zunda_tenpai.wav' },
  zunda_slow: { preferred: '/sounds/voice/zunda_slow.wav' },
  zunda_dora: { preferred: '/sounds/voice/zunda_dora.wav' },
  zunda_start: { preferred: '/sounds/voice/zunda_start.wav' },
};

const tryPlay = async (audio: HTMLAudioElement) => {
  audio.currentTime = 0;
  // Let caller handle rejection so we can try fallbacks.
  await audio.play();
};

export const useSounds = (opts?: { seVolume?: number; voiceVolume?: number }) => {
  const seVolume = opts?.seVolume ?? 0.35;
  const voiceVolume = opts?.voiceVolume ?? 1.0;

  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const voiceChannelRef = useRef<HTMLAudioElement | null>(null);

  const getAudio = useCallback(
    (src: string, volume: number) => {
      const cached = audioCacheRef.current.get(src);
      if (cached) return cached;
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volume;
      audioCacheRef.current.set(src, audio);
      return audio;
    },
    [],
  );

  const playWithFallback = useCallback(
    async (sources: SoundSources, volume: number, singleChannel?: 'voice') => {
      const preferred = getAudio(sources.preferred, volume);

      if (singleChannel === 'voice') {
        if (voiceChannelRef.current && voiceChannelRef.current !== preferred) {
          voiceChannelRef.current.pause();
          voiceChannelRef.current.currentTime = 0;
        }
        voiceChannelRef.current = preferred;
      }

      try {
        await tryPlay(preferred);
        return;
      } catch {
        // try fallback below
      }

      if (!sources.fallback) return;
      const fallback = getAudio(sources.fallback, volume);
      if (singleChannel === 'voice') voiceChannelRef.current = fallback;
      try {
        await tryPlay(fallback);
      } catch {
        // Autoplay restrictions etc. are non-fatal; user interaction will enable later.
      }
    },
    [getAudio],
  );

  const api = useMemo(() => {
    return {
      playSe: (key: SeKey) => playWithFallback(SE_SOURCES[key], seVolume),
      playVoice: (key: VoiceKey) => playWithFallback(VOICE_SOURCES[key], voiceVolume, 'voice'),
      stopVoice: () => {
        if (!voiceChannelRef.current) return;
        voiceChannelRef.current.pause();
        voiceChannelRef.current.currentTime = 0;
      },
    };
  }, [playWithFallback, seVolume, voiceVolume]);

  useEffect(() => {
    // Keep cached volumes in sync if options change.
    for (const [src, audio] of audioCacheRef.current.entries()) {
      const isVoice = src.includes('/sounds/voice/');
      audio.volume = isVoice ? voiceVolume : seVolume;
    }
  }, [seVolume, voiceVolume]);

  return api;
};
