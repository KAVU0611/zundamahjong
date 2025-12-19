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

export type VoiceTuning = {
  speedScale?: number;
  pitchScale?: number;
  intonationScale?: number;
  pauseLengthScale?: number;
  playbackRate?: number;
};

export type VoiceSource =
  | { type: 'key'; key: VoiceKey }
  | { type: 'dynamic'; text: string; tuning?: VoiceTuning }
  | { type: 'asset'; url: string };

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
  const dynamicVoiceCacheRef = useRef<Map<string, string>>(new Map()); // key -> object URL

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

  const voicevoxUrl =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_VOICEVOX_URL || 'http://localhost:50021'
      : 'http://localhost:50021';

  const playVoiceDynamic = useCallback(
    async (text: string, tuning?: VoiceTuning) => {
      if (!text) return;
      const key = `${text}::${JSON.stringify(tuning || {})}`;
      try {
        let objectUrl = dynamicVoiceCacheRef.current.get(key);
        if (!objectUrl) {
          const query = await fetch(
            `${voicevoxUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=3`,
            { method: 'POST' },
          );
          if (!query.ok) throw new Error(`voicevox audio_query failed: ${query.status}`);
          const queryJson = await query.json();
          const body = {
            ...queryJson,
            ...(tuning?.speedScale ? { speedScale: tuning.speedScale } : {}),
            ...(tuning?.pitchScale !== undefined ? { pitchScale: tuning.pitchScale } : {}),
            ...(tuning?.intonationScale !== undefined ? { intonationScale: tuning.intonationScale } : {}),
            ...(tuning?.pauseLengthScale !== undefined ? { pauseLengthScale: tuning.pauseLengthScale } : {}),
          };
          const synth = await fetch(`${voicevoxUrl}/synthesis?speaker=3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!synth.ok) throw new Error(`voicevox synthesis failed: ${synth.status}`);
          const blob = await synth.blob();
          objectUrl = URL.createObjectURL(blob);
          dynamicVoiceCacheRef.current.set(key, objectUrl);
        }
        const audio = getAudio(objectUrl, voiceVolume);
        if (voiceChannelRef.current && voiceChannelRef.current !== audio) {
          voiceChannelRef.current.pause();
          voiceChannelRef.current.currentTime = 0;
        }
        voiceChannelRef.current = audio;
        if (tuning?.playbackRate !== undefined) audio.playbackRate = tuning.playbackRate;
        else if (tuning?.speedScale) audio.playbackRate = tuning.speedScale;
        try {
          await tryPlay(audio);
        } catch {
          // ignore playback errors (e.g. autoplay)
        }
      } catch (err) {
        console.error('Failed to play dynamic voice:', err);
      }
    },
    [getAudio, voiceVolume, voicevoxUrl],
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
      playVoiceDynamic,
      playVoiceSource: (source: VoiceSource) => {
        if (source.type === 'key') return playWithFallback(VOICE_SOURCES[source.key], voiceVolume, 'voice');
        if (source.type === 'dynamic') return playVoiceDynamic(source.text, source.tuning);
        if (source.type === 'asset') {
          const audio = getAudio(source.url, voiceVolume);
          if (voiceChannelRef.current && voiceChannelRef.current !== audio) {
            voiceChannelRef.current.pause();
            voiceChannelRef.current.currentTime = 0;
          }
          voiceChannelRef.current = audio;
          return tryPlay(audio).catch(() => undefined);
        }
        return Promise.resolve();
      },
      stopVoice: () => {
        if (!voiceChannelRef.current) return;
        voiceChannelRef.current.pause();
        voiceChannelRef.current.currentTime = 0;
      },
    };
  }, [playWithFallback, seVolume, voiceVolume, playVoiceDynamic, getAudio]);

  useEffect(() => {
    // Keep cached volumes in sync if options change.
    for (const [src, audio] of audioCacheRef.current.entries()) {
      const isVoice = src.includes('/sounds/voice/');
      audio.volume = isVoice ? voiceVolume : seVolume;
    }
  }, [seVolume, voiceVolume]);

  return api;
};
