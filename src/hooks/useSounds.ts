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
  | 'zunda_start'
  | 'zunda_player_win';

export type VoiceSource = { type: 'key'; key: VoiceKey } | { type: 'asset'; url: string };

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
  zunda_player_win: { preferred: '/sounds/voice/zunda_player_win.wav' },
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
  const seChannelRef = useRef<HTMLAudioElement | null>(null);

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

  const stopChannelAudio = useCallback((channel: 'se' | 'voice', next?: HTMLAudioElement) => {
    const ref = channel === 'voice' ? voiceChannelRef : seChannelRef;
    const current = ref.current;
    if (current && current !== next) {
      current.pause();
      current.currentTime = 0;
    }
    if (next) {
      ref.current = next;
    } else {
      ref.current = null;
    }
  }, []);

  const playWithFallback = useCallback(
    async (sources: SoundSources, volume: number, channel: 'se' | 'voice') => {
      const preferred = getAudio(sources.preferred, volume);
      stopChannelAudio(channel, preferred);

      try {
        await tryPlay(preferred);
        return;
      } catch {
        // try fallback below
      }

      if (!sources.fallback) return;
      const fallback = getAudio(sources.fallback, volume);
      stopChannelAudio(channel, fallback);
      try {
        await tryPlay(fallback);
      } catch {
        // Autoplay restrictions etc. are non-fatal; user interaction will enable later.
      }
    },
    [getAudio, stopChannelAudio],
  );

  const api = useMemo(() => {
    return {
      playSe: (key: SeKey) => playWithFallback(SE_SOURCES[key], seVolume, 'se'),
      playVoice: (key: VoiceKey) => playWithFallback(VOICE_SOURCES[key], voiceVolume, 'voice'),
      playVoiceSource: (source: VoiceSource) => {
        if (source.type === 'key') return playWithFallback(VOICE_SOURCES[source.key], voiceVolume, 'voice');
        if (source.type === 'asset') {
          const audio = getAudio(source.url, voiceVolume);
          stopChannelAudio('voice', audio);
          return tryPlay(audio).catch(() => undefined);
        }
        return Promise.resolve();
      },
      stopVoice: () => {
        stopChannelAudio('voice');
      },
    };
  }, [playWithFallback, seVolume, voiceVolume, getAudio, stopChannelAudio]);

  useEffect(() => {
    // Keep cached volumes in sync if options change.
    for (const [src, audio] of audioCacheRef.current.entries()) {
      const isVoice = src.includes('/sounds/voice/');
      audio.volume = isVoice ? voiceVolume : seVolume;
    }
  }, [seVolume, voiceVolume]);

  return api;
};
