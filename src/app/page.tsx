'use client';

import React from 'react';
import Image from 'next/image';
import { useMahjong, TileId, GameState } from '../hooks/useMahjong';
import { useSounds, VoiceKey } from '../hooks/useSounds';
import { TILE_ASSET_PATHS, TILE_ID_TO_IMAGE_MAP } from './tileAssets';
import { pickZundaQuote, type ZundaQuoteCategory } from '../lib/zundaQuotes';
import { getZundaVoice } from '../utils/zundaVoice';

const parseTileIdForDisplay = (tileId: TileId): { base: TileId; isRed: boolean } => {
  const dashParts = tileId.split('-');
  if (dashParts.length >= 3) {
    const [type, numStr, indexStr] = dashParts;
    const number = parseInt(numStr ?? '', 10);
    const index = parseInt(indexStr ?? '', 10);
    const suit = type === 'man' ? 'm' : type === 'pin' ? 'p' : type === 'sou' ? 's' : type === 'honor' ? 'z' : null;
    if (suit && Number.isFinite(number)) {
      return {
        base: `${suit}${number}`,
        isRed: (type === 'man' || type === 'pin' || type === 'sou') && number === 5 && index === 0,
      };
    }
  }
  const base = tileId.split('_')[0]!;
  const isRed = tileId.includes('_dora_') || tileId.endsWith('_dora') || tileId.endsWith('_red');
  return { base, isRed };
};

const tileBaseId = (tileId: TileId): TileId => parseTileIdForDisplay(tileId).base;
const isAkaDoraTile = (tileId: TileId) => parseTileIdForDisplay(tileId).isRed;
const getTilePath = (tileId: TileId): string => {
  const base = tileBaseId(tileId);
  if (isAkaDoraTile(tileId)) {
    if (base === 'm5') return '/tiles/Man5-Dora.png';
    if (base === 'p5') return '/tiles/Pin5-Dora.png';
    if (base === 's5') return '/tiles/Sou5-Dora.png';
  }
  return `/tiles/${TILE_ID_TO_IMAGE_MAP[base]}.png`;
};

const preloadImages = (paths: string[]) => {
  if (typeof window === 'undefined') return;
  for (const src of paths) {
    const img = new window.Image();
    img.decoding = 'async';
    img.src = src;
  }
};

type TileProps = {
  tileId?: TileId | null;
  isBack?: boolean;
  onClick?: () => void;
  className?: string;
  muted?: boolean;
  horizontal?: boolean;
};

const Tile: React.FC<TileProps> = ({ tileId, isBack = false, onClick, className = '', muted = false, horizontal = false }) => {
  const baseStyle =
    'w-8 h-12 sm:w-10 sm:h-14 shrink-0 rounded-md shadow-md cursor-pointer select-none touch-manipulation transform transition-transform sm:hover:-translate-y-1 active:translate-y-0';
  const thicknessStyle = 'border-b-4 border-gray-400';
  const emphasisStyle = muted ? 'opacity-60 saturate-75' : '';
  const orientationStyle = horizontal ? 'rotate-90 origin-center' : '';

  if (isBack) {
    return (
      <div className={`${baseStyle} ${thicknessStyle} ${orientationStyle} relative ${className}`}>
        <Image src="/tiles/Back.png" alt="Tile back" fill unoptimized className="object-cover rounded-md" />
      </div>
    );
  }

  if (!tileId) {
    return (
      <div
        className={`${baseStyle} ${thicknessStyle} ${orientationStyle} relative bg-green-950/20 border border-green-700/30 ${className}`}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      className={`${baseStyle} ${thicknessStyle} relative bg-white ${emphasisStyle} ${orientationStyle} ${className}`}
    >
      <Image src="/tiles/Front.png" alt="Tile front base" fill unoptimized className="absolute inset-0 w-full h-full rounded-md" />
      <Image src={getTilePath(tileId)} alt={tileBaseId(tileId)} fill unoptimized className="relative z-10 w-full h-full object-contain p-1" />
    </div>
  );
};

type MeldData = { type: 'pon' | 'chi' | 'kan'; tiles: TileId[]; concealed?: boolean };

const ZUNDAMON_STATES = {
  waiting: { img: 'normal.png', text: '麻雀するのだ！' },
  player_turn: { img: 'normal.png', text: 'あなたの番なのだ。' },
  opponent_turn: { img: 'aori.png', text: '僕のターンなのだ！' },
  reach: { img: 'aori.png', text: 'リーチなのだ！' },
  tsumo: { img: 'win.png', text: 'ツモ！' },
  ron: { img: 'win.png', text: 'ロン！' },
  ryuukyoku: { img: 'bored.png', text: '流局なのだ。' },
  round_end: { img: 'normal.png', text: '次の局いくのだ。' },
  match_end: { img: 'normal.png', text: 'おつかれさまなのだ。' },
};

// LOSE_QUOTE_LONG: プレイヤー勝利時の長い煽りセリフ（UI/音声で共用）
const LOSE_QUOTE_LONG =
  'あーあ、そう来ちゃったのだ。まあ、たまたまなのだ。麻雀っていうのは不確定情報ゲームだから、確率のイタズラで正解を引くこともあるのだ。それを「実力」だと勘違いするのが、まあ人間の可愛いところなんだけど。\n今回のボクの敗因は、君がセオリー無視の「期待値マイナス打牌」をしてきたことによるバタフライエフェクトなのだ。本来ならボクの勝ちルートだったのに、ノイズが混ざったせいで計算が狂っただけなのだ。\nそもそも今の配牌、統計的に見ても偏りすぎてたし、乱数生成アルゴリズムのバグを疑うレベルなのだ。今回は「ハンデ」として勝ちを譲ってあげるけど、勘違いしないでほしいのだ。次やったらボクの論理的思考が君の運だけ麻雀を粉砕するから、今のうちにスクショでも撮って喜んでおけばいいのだ。\n……はいはい、おめでとうなのだ。すごいすごい。……って、本気で喜んでるのだ？ 引くわー。今のボク、実は「接待モード」のレベル1だったんだけど。君が気持ちよく勝てるように、わざと危険牌を掴むようにプログラムされてただけなのだ。\nつまり君は、ボクの手のひらの上で踊らされてただけってこと。それを「勝った！」って大喜びできるそのメンタル、ある意味尊敬するのだ。統計的には君の勝率は3%しかなかったのに、たまたま上振れただけの事象に一喜一憂できるなんて、人間って本当に燃費のいい生き物なのだ。\nまあ、ボクはAIだから悔しくなんてないけど？ 全然？ ただのデータ収集の一環だし？ ……ふん、次は本気出すから覚悟するのだ。';

const ZUNDA_VOICE_MAP = {
  start: { file: 'zunda_start.wav', text: 'よろしくなのだ、絶対負けないのだ' },
  dora: { file: 'zunda_dora.wav', text: 'お、ドラ切ったのだ？' },
  kan: { file: 'zunda_kan.wav', text: 'カ〜ン！' },
  tenpai: { file: 'zunda_tenpai.wav', text: 'そろそろあがれそうなのだ' },
  slow: { file: 'zunda_slow.wav', text: '遅いのだ、早く打つのだ' },
  pon: { file: 'zunda_pon.wav', text: 'ポンなのだ！' },
  chi: { file: 'zunda_chi.wav', text: 'チーなのだ、もらうのだ' },
  riichi: { file: 'zunda_riichi.wav', text: 'リーチなのだ、覚悟するのだ' },
  tsumo: { file: 'zunda_tsumo.wav', text: 'ツモ！文句ないのだ' },
  ron: { file: 'zunda_ron.wav', text: 'ロン！弱い、弱すぎるのだｗ' },
  player_win: { file: 'zunda_player_win.wav', text: LOSE_QUOTE_LONG },
};

type ZundaVoiceKey = keyof typeof ZUNDA_VOICE_MAP;
const ZUNDA_VOICE_KEY_TO_SOUND: Record<ZundaVoiceKey, VoiceKey> = {
  start: 'zunda_start',
  dora: 'zunda_dora',
  kan: 'zunda_kan',
  tenpai: 'zunda_tenpai',
  slow: 'zunda_slow',
  pon: 'zunda_pon',
  chi: 'zunda_chi',
  riichi: 'zunda_riichi',
  tsumo: 'zunda_tsumo',
  ron: 'zunda_ron',
  player_win: 'zunda_player_win',
};

const END_QUOTE_CATEGORIES: Set<ZundaQuoteCategory> = new Set([
  'DRAW_TENPAI',
  'DRAW_NOTEN',
  'WIN_SMALL_RON',
  'WIN_SMALL_TSUMO',
  'WIN_BIG',
  'GAME_WIN',
  'PLAYER_WIN_LOW',
  'PLAYER_WIN_HIGH',
  'PLAYER_WIN_GENERIC',
]);

const Zundamon: React.FC<{ mode: keyof typeof ZUNDAMON_STATES; text: string }> = ({ mode, text }) => {
  const state = ZUNDAMON_STATES[mode] || ZUNDAMON_STATES.waiting;
  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="w-28 h-28 sm:w-36 sm:h-36 relative">
        <Image src={`/zunda/${state.img}`} alt="Zundamon" fill unoptimized className="object-contain" />
      </div>
      <div className="mt-2 p-2 bg-white rounded-lg shadow-md text-center text-gray-800 max-w-[92vw]">
        <p className="text-sm sm:text-base min-h-[1.5em]">{text}</p>
      </div>
    </div>
  );
};

const MeldView: React.FC<{ meld: MeldData }> = ({ meld }) => {
  const isAnkan = meld.type === 'kan' && meld.concealed;
  return (
    <div className="flex gap-1">
      {meld.tiles.map((t, idx) => (
        <Tile
          key={`${t}-${idx}`}
          tileId={t}
          isBack={isAnkan && (idx === 0 || idx === 3)}
          className="cursor-default transform-none"
        />
      ))}
    </div>
  );
};

const MeldZone: React.FC<{ title: string; melds: MeldData[]; className?: string }> = ({ title, melds, className = '' }) => {
  return (
    <div
      className={`min-w-0 w-full sm:min-w-[180px] bg-gray-200/80 text-gray-900 rounded-lg px-3 py-2 border border-gray-300 shadow-inner ${className}`}
    >
      <p className="text-sm font-bold mb-1">{title}</p>
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {melds.length ? (
          melds.map((m, idx) => (
            <div key={`${m.type}-${idx}`} className="bg-white/70 px-1 py-0.5 rounded shadow-sm">
              <MeldView meld={m} />
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-600">なし</p>
        )}
      </div>
    </div>
  );
};

type PlayerHandProps = {
  hand: TileId[];
  drawnTile?: TileId | null;
  gameState: GameState;
  isRiichi: boolean;
  onDiscardFromHand: (index: number) => void;
  onDiscardDrawn: () => void;
};

const PlayerHand: React.FC<PlayerHandProps> = ({
  hand,
  drawnTile,
  gameState,
  isRiichi,
  onDiscardFromHand,
  onDiscardDrawn,
}) => {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const prevTileCountRef = React.useRef(0);
  const isPlayerTurn = gameState === 'player_turn';

  React.useEffect(() => {
    const container = scrollRef.current;
    const currentCount = hand.length + (drawnTile ? 1 : 0);
    const prevCount = prevTileCountRef.current;

    if (container && currentCount > prevCount) {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
    }

    prevTileCountRef.current = currentCount;
  }, [hand, drawnTile]);

  return (
    <div ref={scrollRef} className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar w-full">
      {hand.map((tile, i) => (
        <Tile
          key={tile}
          tileId={tile}
          onClick={isPlayerTurn && !isRiichi ? () => onDiscardFromHand(i) : undefined}
          className={!isPlayerTurn || isRiichi ? 'opacity-60 cursor-not-allowed sm:hover:translate-y-0 transform-none' : ''}
        />
      ))}
      {drawnTile && (
        <div className="ml-2 sm:ml-3">
          <Tile
            key={drawnTile}
            tileId={drawnTile}
            onClick={isPlayerTurn ? onDiscardDrawn : undefined}
            className={!isPlayerTurn ? 'opacity-60 cursor-not-allowed sm:hover:translate-y-0 transform-none' : ''}
          />
        </div>
      )}
    </div>
  );
};

export default function MahjongPage() {
  const { playSe, playVoice, playVoiceSource, stopVoice } = useSounds();
  const [zundaFullText, setZundaFullText] = React.useState<string>(ZUNDAMON_STATES.waiting.text);
  const [zundaDisplayedText, setZundaDisplayedText] = React.useState<string>(ZUNDAMON_STATES.waiting.text);
  const [zundaTextSource, setZundaTextSource] = React.useState<'state' | 'voice'>('state');
  const zundaVoiceResetTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const zundamonModeRef = React.useRef<keyof typeof ZUNDAMON_STATES>('waiting');
  const quoteActiveRef = React.useRef(false);
  const persistentVoiceRef = React.useRef(false);

  const triggerQuote = React.useCallback(
    (category: ZundaQuoteCategory, options?: { force?: boolean; persistText?: boolean }) => {
      const force = options?.force ?? false;
      if (!force && Math.random() >= 0.3) return;
      const voiceLine = getZundaVoice(category);
      const text = voiceLine?.text ?? pickZundaQuote(category);
      if (!text) return;
      if (zundaVoiceResetTimerRef.current) clearTimeout(zundaVoiceResetTimerRef.current);
      const baseText = ZUNDAMON_STATES[zundamonModeRef.current]?.text ?? ZUNDAMON_STATES.waiting.text;
      const shouldPersist = Boolean(options?.persistText || END_QUOTE_CATEGORIES.has(category));
      stopVoice();
      setZundaTextSource('voice');
      setZundaFullText(text);
      setZundaDisplayedText('');
      quoteActiveRef.current = true;
      persistentVoiceRef.current = shouldPersist;
      if (!shouldPersist) {
        zundaVoiceResetTimerRef.current = setTimeout(() => {
          setZundaTextSource('state');
          setZundaFullText(baseText);
          setZundaDisplayedText(baseText);
          quoteActiveRef.current = false;
        }, 5000);
      }
      if (voiceLine?.file) {
        playVoiceSource({ type: 'asset', url: voiceLine.file });
      }
    },
    [playVoiceSource, stopVoice],
  );

  const handleQuote = React.useCallback(
    (category: ZundaQuoteCategory, options?: { force?: boolean; persistText?: boolean }) => {
      triggerQuote(category, { ...options, persistText: options?.persistText });
    },
    [triggerQuote],
  );

  const {
    gameState,
    round,
    scores,
    honba,
    kyotaku,
    wall,
    doraIndicators,
    uraIndicators,
    doraTiles,
    uraDoraTiles,
    drawCount,
    remainingJun,
    playerHand,
    opponentHand,
    playerMelds,
    opponentMelds,
    playerRiver,
    opponentRiver,
    playerDrawn,
    opponentDrawn,
    currentTurn,
    riichiState,
    riichiIntent,
    canRiichi,
    riichiDeclarationIndex,
    calledRiverIndices,
    callPrompt,
    winPrompt,
    roundResult,
    reaction,
    startGame,
    nextRound,
    discardTile,
    kanCandidates,
    declareKan,
    resolveCall,
    resolveWinPrompt,
    handleRiichi,
  } = useMahjong({ onQuote: handleQuote, suppressRoundEndQuotes: false });
  const zundamonMode = (reaction === 'none' ? (gameState as keyof typeof ZUNDAMON_STATES) : reaction) ?? 'waiting';
  React.useEffect(() => {
    zundamonModeRef.current = zundamonMode;
  }, [zundamonMode]);
  const isPlayerDealer = round?.dealer === 'player';
  const isOpponentDealer = round?.dealer === 'opponent';
  const [kanSelectOpen, setKanSelectOpen] = React.useState(false);
  const prevOpponentMeldCountRef = React.useRef(0);
  const prevOpponentRiichiRef = React.useRef(false);
  const prevOpponentRiichiIntentRef = React.useRef(false);
  const prevPlayerRiverCountRef = React.useRef(0);
  const prevOpponentRiverCountRef = React.useRef(0);
  const prevRoundResultKeyRef = React.useRef<string | null>(null);
  const playerWinVoicePlayedRef = React.useRef(false);
  const prevFinalSummaryRef = React.useRef(false);
  const slowWarnedRef = React.useRef(false);
  const tileAssetsPreloadedRef = React.useRef(false);
  const opponentResultHandRef = React.useRef<HTMLDivElement | null>(null);
  const opponentRyukyokuHandRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (tileAssetsPreloadedRef.current) return;
    tileAssetsPreloadedRef.current = true;
    preloadImages(TILE_ASSET_PATHS);
  }, []);

  React.useEffect(() => {
    const baseText = ZUNDAMON_STATES[zundamonMode]?.text ?? ZUNDAMON_STATES.waiting.text;
    if (zundaTextSource === 'state') {
      setZundaFullText(baseText);
    }
  }, [zundamonMode, zundaTextSource]);

  React.useEffect(() => {
    setZundaDisplayedText('');
    if (!zundaFullText) return;
    let index = 0;
    const typingIntervalMs = zundaFullText === LOSE_QUOTE_LONG ? 22 : 50;
    const interval = setInterval(() => {
      index += 1;
      setZundaDisplayedText(zundaFullText.slice(0, index));
      if (index >= zundaFullText.length) {
        clearInterval(interval);
      }
    }, typingIntervalMs);
    return () => clearInterval(interval);
  }, [zundaFullText]);

  const playZundaVoice = React.useCallback(
    (key: ZundaVoiceKey, options?: { persistText?: boolean }) => {
      if (quoteActiveRef.current) return; // Quote voice/text takes priority.
      const def = ZUNDA_VOICE_MAP[key];
      if (!def) return;

      if (zundaVoiceResetTimerRef.current) {
        clearTimeout(zundaVoiceResetTimerRef.current);
      }

      setZundaTextSource('voice');
      setZundaFullText(def.text);
      setZundaDisplayedText('');

      const voiceKey = ZUNDA_VOICE_KEY_TO_SOUND[key] as VoiceKey;
      playVoice(voiceKey);

      const baseText = ZUNDAMON_STATES[zundamonMode]?.text ?? ZUNDAMON_STATES.waiting.text;
      const shouldPersist = Boolean(options?.persistText);
      persistentVoiceRef.current = shouldPersist;
      if (!shouldPersist) {
        const duration = Math.max(def.text.length * 50 + 1200, 1500);
        zundaVoiceResetTimerRef.current = setTimeout(() => {
          setZundaTextSource('state');
          setZundaFullText(baseText);
          setZundaDisplayedText('');
        }, duration);
      }
    },
    [playVoice, zundamonMode],
  );

  const resetZundaText = React.useCallback(() => {
    if (zundaVoiceResetTimerRef.current) {
      clearTimeout(zundaVoiceResetTimerRef.current);
      zundaVoiceResetTimerRef.current = null;
    }
    stopVoice();
    quoteActiveRef.current = false;
    persistentVoiceRef.current = false;
    const baseText = ZUNDAMON_STATES[zundamonModeRef.current]?.text ?? ZUNDAMON_STATES.waiting.text;
    setZundaTextSource('state');
    setZundaFullText(baseText);
    setZundaDisplayedText(baseText);
  }, [stopVoice]);

  React.useEffect(() => {
    return () => {
      if (zundaVoiceResetTimerRef.current) {
        clearTimeout(zundaVoiceResetTimerRef.current);
      }
      quoteActiveRef.current = false;
      persistentVoiceRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (gameState !== 'player_turn') setKanSelectOpen(false);
  }, [gameState]);

  React.useEffect(() => {
    const prev = prevOpponentMeldCountRef.current;
    if (opponentMelds.length > prev) {
      const last = opponentMelds[opponentMelds.length - 1];
      if (last?.type === 'pon') playZundaVoice('pon');
      if (last?.type === 'chi') playZundaVoice('chi');
      if (last?.type === 'kan') playZundaVoice('kan');
    }
    prevOpponentMeldCountRef.current = opponentMelds.length;
  }, [opponentMelds, playZundaVoice]);

  React.useEffect(() => {
    const prev = prevOpponentRiichiRef.current;
    if (!prev && riichiState.opponent) playZundaVoice('riichi');
    prevOpponentRiichiRef.current = riichiState.opponent;
  }, [riichiState.opponent, playZundaVoice]);

  React.useEffect(() => {
    // 相手のリーチ準備（テンパイ気配）
    const prev = prevOpponentRiichiIntentRef.current;
    if (!prev && riichiIntent.opponent && !riichiState.opponent) playZundaVoice('tenpai');
    prevOpponentRiichiIntentRef.current = riichiIntent.opponent;
  }, [riichiIntent.opponent, riichiState.opponent, playZundaVoice]);

  React.useEffect(() => {
    const prevCount = prevPlayerRiverCountRef.current;
    if (playerRiver.length > prevCount) {
      const last = playerRiver[playerRiver.length - 1];
      if (last && doraTiles.includes(last.base)) playZundaVoice('dora');
    }
    prevPlayerRiverCountRef.current = playerRiver.length;
  }, [playerRiver, doraTiles, playZundaVoice]);

  React.useEffect(() => {
    const prevCount = prevOpponentRiverCountRef.current;
    if (opponentRiver.length > prevCount) {
      playSe('discard');
    }
    prevOpponentRiverCountRef.current = opponentRiver.length;
  }, [opponentRiver, playSe]);

  React.useEffect(() => {
    if (!roundResult) {
      prevRoundResultKeyRef.current = null;
      playerWinVoicePlayedRef.current = false;
      prevFinalSummaryRef.current = false;
      return;
    }
    const key = `${roundResult.reason}-${roundResult.winner ?? 'none'}-${roundResult.loser ?? 'none'}`;
    const isNewResult = prevRoundResultKeyRef.current !== key;
    if (isNewResult) {
      prevRoundResultKeyRef.current = key;
      playerWinVoicePlayedRef.current = false;
    }

    const isRoundResolution =
      roundResult.reason === 'tsumo' || roundResult.reason === 'ron' || roundResult.reason === 'ryuukyoku';

    if (isNewResult && isRoundResolution) {
      playSe('win');
    }

    const isFinalSummary = gameState === 'match_end' && roundResult.applied;
    const wasFinalSummary = prevFinalSummaryRef.current;
    if (isRoundResolution && isFinalSummary && !wasFinalSummary && scores.player > scores.opponent && !playerWinVoicePlayedRef.current) {
      if (zundaVoiceResetTimerRef.current) {
        clearTimeout(zundaVoiceResetTimerRef.current);
        zundaVoiceResetTimerRef.current = null;
      }
      quoteActiveRef.current = false;
      persistentVoiceRef.current = false;
      stopVoice();
      playZundaVoice('player_win', { persistText: true });
      playerWinVoicePlayedRef.current = true;
    }
    prevFinalSummaryRef.current = isFinalSummary;
  }, [roundResult, gameState, playSe, playZundaVoice, stopVoice, scores.player, scores.opponent]);

  React.useEffect(() => {
    if (gameState !== 'player_turn') {
      slowWarnedRef.current = false;
      return;
    }
    if (slowWarnedRef.current) return;
    const t = setTimeout(() => {
      if (gameState !== 'player_turn') return;
      slowWarnedRef.current = true;
      playZundaVoice('slow');
    }, 12000);
    return () => clearTimeout(t);
  }, [gameState, playZundaVoice]);

  const overlayTitle = React.useMemo(() => {
    if (!roundResult) return '';
    if (roundResult.reason === 'ryuukyoku') return '流局';
    if (roundResult.winner === 'player') return 'あなたのアガリ！';
    if (roundResult.winner === 'opponent') return 'ずんだもんのアガリ！';
    return '';
  }, [roundResult]);

  const resultDetails = React.useMemo(() => {
    if (!roundResult) return null;
    if (roundResult.reason === 'ryuukyoku') {
      return { title: '流局', body: '流局しました。' };
    }
    if (!roundResult.winner) return null;
    const method = roundResult.reason === 'tsumo' ? 'ツモ' : 'ロン';
    const winnerLabel = roundResult.winner === 'player' ? 'あなた' : 'ずんだもん';
    const loserLabel = roundResult.winner === 'player' ? 'ずんだもん' : 'あなた';
    const points = roundResult.points ?? 0;
    const kyotakuPoints = roundResult.kyotakuPoints ?? 0;
    const kyotakuText = kyotakuPoints > 0 ? `（供託 +${kyotakuPoints}点）` : '';
    return {
      title: `${winnerLabel}の${method}`,
      body: `${winnerLabel}: +${points}点 / ${loserLabel}: -${points}点 ${kyotakuText}`,
    };
  }, [roundResult]);

  const isFinalWinnerDecided = gameState === 'match_end' && roundResult?.applied && scores.player !== scores.opponent;
  const finalShareText = React.useMemo(() => {
    if (!isFinalWinnerDecided) return '';
    const winnerLabel = scores.player > scores.opponent ? 'あなたの勝ち！' : 'ずんだもんの勝ち！';
    return `ずんだ麻雀 終局：${winnerLabel} 最終スコア あなた ${scores.player} 点 / ずんだもん ${scores.opponent} 点\nhttps://zundamahjong.com\n(作成者: 島根のAIエンジニア @miharaeditor)`;
  }, [isFinalWinnerDecided, scores]);

  const handleShareToX = React.useCallback(() => {
    if (!finalShareText) return;
    if (typeof window === 'undefined') return;
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(finalShareText)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
  }, [finalShareText]);

  const handleDiscardFromHand = React.useCallback(
    (index: number) => {
      playSe('discard');
      discardTile(index, false);
    },
    [discardTile, playSe],
  );

  const handleDiscardDrawn = React.useCallback(() => {
    playSe('discard');
    discardTile(0, true);
  }, [discardTile, playSe]);

  const scrollHandRow = React.useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
      const el = ref.current;
      if (!el) return;
      const delta = direction === 'left' ? -240 : 240;
      el.scrollBy({ left: delta, behavior: 'smooth' });
    },
    [],
  );

  const opponentWinTileForReveal = React.useMemo<TileId | null>(() => {
    if (!roundResult) return null;
    if (roundResult.reason === 'ryuukyoku') return null;
    if (roundResult.winner !== 'opponent') return null;
    if (roundResult.reason === 'tsumo') return opponentDrawn ?? null;
    // Ron tile is the player's last discard (should still be face-up in the river).
    const last = playerRiver[playerRiver.length - 1];
    return (last?.tileId ?? last?.base) ?? null;
  }, [roundResult, opponentDrawn, playerRiver]);

  const showOpponentHandOnRyukyoku = React.useMemo(
    () => roundResult?.reason === 'ryuukyoku' && !!roundResult.tenpai?.opponent,
    [roundResult],
  );

  const opponentHandOnRyukyoku = React.useMemo(() => {
    if (!showOpponentHandOnRyukyoku) return null;
    const tiles: TileId[] = [...opponentHand];
    if (opponentDrawn) tiles.push(opponentDrawn);
    return tiles;
  }, [showOpponentHandOnRyukyoku, opponentHand, opponentDrawn]);

  return (
    <main className="flex flex-col items-center min-h-[100dvh] bg-green-800 text-white p-2 sm:p-3 font-sans overflow-x-hidden">
      <div className="w-full max-w-5xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-sm text-green-100">{round?.label ?? '---'}</p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">ずんだ麻雀（2人打ち）</h1>
            <p className="text-xs text-green-100">東1→東2→南1→南2で終了。残巡0で牌を切った瞬間に流局（ロンのみ可）。</p>
          </div>
          <div className="flex flex-wrap gap-2 items-stretch">
            <div className="bg-green-900/80 px-3 py-2 rounded border border-green-700/60 min-w-[120px] flex-1">
              <p className="text-xs">本場 / 供託</p>
              <p className="text-lg sm:text-xl font-bold">
                {honba}本場 / {kyotaku}本
              </p>
              <p className="text-[11px] text-green-100">供託はアガリで回収</p>
            </div>
            <div className="bg-green-900/80 px-3 py-2 rounded border border-green-700/60 min-w-[120px] flex-1">
              <p className="text-xs flex items-center gap-2">
                プレイヤー
                {isPlayerDealer && <span className="px-2 py-[2px] rounded bg-yellow-400 text-black font-bold text-[10px]">親</span>}
              </p>
              <p className="text-lg sm:text-xl font-bold">{scores.player} 点</p>
              {riichiState.player && <p className="text-xs text-yellow-300">リーチ中</p>}
              {riichiIntent.player && !riichiState.player && <p className="text-[11px] text-yellow-200">リーチ準備ON</p>}
            </div>
            <div className="bg-green-900/80 px-3 py-2 rounded border border-green-700/60 min-w-[120px] flex-1">
              <p className="text-xs flex items-center gap-2">
                ずんだもん
                {isOpponentDealer && <span className="px-2 py-[2px] rounded bg-yellow-400 text-black font-bold text-[10px]">親</span>}
              </p>
              <p className="text-lg sm:text-xl font-bold">{scores.opponent} 点</p>
              {riichiState.opponent && <p className="text-xs text-yellow-300">リーチ中</p>}
            </div>
          </div>
        </div>

        {gameState === 'waiting' && (
          <button
            onClick={() => {
              playSe('click');
              resetZundaText();
              playZundaVoice('start');
              startGame();
            }}
            className="self-center px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-bold shadow-lg"
          >
            ゲーム開始
          </button>
        )}

        <div className="flex flex-col gap-3 bg-green-900/40 rounded-xl p-2 sm:p-3 shadow-inner border border-green-700/50">
          <section className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
            <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3">
              <div className="flex flex-nowrap items-center gap-1 bg-green-950/40 rounded-lg px-2 py-1 border border-green-700/50 overflow-x-auto no-scrollbar max-w-full w-full">
                {opponentHand.map((_, i) => (
                  <Tile key={i} isBack className="cursor-default transform-none" />
                ))}
                {opponentDrawn && <Tile isBack className="cursor-default transform-none" />}
              </div>
              <MeldZone title="ずんだもんの鳴き牌" melds={opponentMelds} className="self-start" />
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-sm text-green-100">
              <span className="px-2 py-1 rounded bg-green-950/70 border border-green-700/50">
                {currentTurn === 'player' ? 'あなたの手番' : 'ずんだもんの手番'}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-center gap-1 p-2 bg-green-950/50 rounded-lg border border-green-700/40">
              {opponentRiver.map((tile, i) => (
                <Tile
                  key={tile.id}
                  tileId={tile.tileId}
                  muted={calledRiverIndices.opponent.includes(i)}
                  horizontal={riichiDeclarationIndex.opponent === i}
                  className="w-7 h-10 sm:w-8 sm:h-12 shadow-none cursor-default transform-none"
                />
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_auto_1fr] gap-2 sm:gap-3 items-center">
              <div className="order-2 sm:order-1 text-center bg-green-950/50 rounded-lg p-2 sm:p-3 border border-green-700/40 h-full flex flex-col justify-center">
                <p className="font-bold text-base sm:text-lg mb-2">ドラ表示</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {doraIndicators.map((tile, idx) => (
                    <Tile key={`${tile}-${idx}`} tileId={tile} className="w-7 h-10 sm:w-8 sm:h-12 cursor-default transform-none" />
                  ))}
                </div>
                <p className="text-xs sm:text-sm text-green-100 mt-1">ドラ: {doraTiles.join(', ') || 'なし'}</p>
              </div>

              <div className="order-1 sm:order-2 flex flex-col items-center gap-1 relative z-40">
                <Zundamon mode={zundamonMode} text={zundaDisplayedText} />
              </div>

              <div className="order-3 text-center bg-green-950/50 rounded-lg p-2 sm:p-3 border border-green-700/40 h-full flex flex-col justify-center">
                <p className="font-bold text-base sm:text-lg mb-2">進行状況</p>
                <p className="text-xs sm:text-sm text-green-100">山残 {wall.length} 枚</p>
                <p className="text-xs sm:text-sm text-green-100">残巡 {remainingJun}</p>
                <p className="text-xs sm:text-sm text-green-100">ツモ数 {drawCount}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1 p-2 bg-green-950/50 rounded-lg border border-green-700/40">
              {playerRiver.map((tile, i) => (
                <Tile
                  key={tile.id}
                  tileId={tile.tileId}
                  muted={calledRiverIndices.player.includes(i)}
                  horizontal={riichiDeclarationIndex.player === i}
                  className="w-7 h-10 sm:w-8 sm:h-12 shadow-none cursor-default transform-none"
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="w-full flex flex-col items-stretch gap-2 sm:gap-3 bg-green-950/40 rounded-lg px-2 sm:px-3 py-2 border border-green-700/40">
              <PlayerHand
                hand={playerHand}
                drawnTile={playerDrawn}
                gameState={gameState}
                isRiichi={riichiState.player}
                onDiscardFromHand={handleDiscardFromHand}
                onDiscardDrawn={handleDiscardDrawn}
              />
              <MeldZone title="あなたの鳴き牌" melds={playerMelds} />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {kanCandidates.length > 0 && (
                <button
                  onClick={() => {
                    playSe('click');
                    if (kanCandidates.length === 1) {
                      declareKan(kanCandidates[0]!.base);
                      return;
                    }
                    setKanSelectOpen(true);
                  }}
                  disabled={gameState !== 'player_turn'}
                  className={`px-4 py-2 rounded font-bold border bg-purple-600 text-white border-purple-800 hover:bg-purple-500 ${
                    gameState !== 'player_turn' ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  カン
                </button>
              )}
              <button
                onClick={() => {
                  const applied = handleRiichi('player');
                  // リーチ宣言ONの時だけクリック音（キャンセル時は鳴らさない）
                  if (applied) playSe('click');
                }}
                disabled={gameState !== 'player_turn' || riichiState.player || (!canRiichi.player && !riichiIntent.player)}
                className={`px-4 py-2 rounded font-bold border ${
                  riichiState.player
                    ? 'bg-yellow-400 text-black border-yellow-200 shadow-inner'
                    : riichiIntent.player
                      ? 'bg-yellow-300 text-black border-yellow-500 shadow-inner'
                      : 'bg-yellow-500 text-black border-yellow-600 hover:bg-yellow-400'
                } ${gameState !== 'player_turn' || (!canRiichi.player && !riichiIntent.player) ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {riichiState.player
                  ? 'リーチ中'
                  : riichiIntent.player
                    ? 'リーチ準備ON（クリックで取消）'
                    : canRiichi.player
                      ? 'リーチ'
                      : 'リーチ（テンパイのみ）'}
              </button>
            </div>
          </section>
        </div>
      </div>
      {callPrompt && !roundResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white text-gray-900 p-4 rounded shadow-lg w-[92vw] max-w-sm">
            <p className="font-bold mb-2">
              {callPrompt.canRon && !callPrompt.pon && !callPrompt.kan && callPrompt.chiOptions.length === 0
                ? `ロンしますか？ (${callPrompt.tile})`
                : `ずんだもんの捨て牌を鳴きますか？ (${callPrompt.tile})`}
            </p>
            <div className="flex flex-wrap gap-2">
              {callPrompt.canRon && (
                <button
                  className="px-3 py-2 bg-red-500 text-white rounded"
                  onClick={() => {
                    playSe('click');
                    resolveCall('ron');
                  }}
                >
                  ロン
                </button>
              )}
              {callPrompt.pon && (
                <button
                  className="px-3 py-2 bg-blue-500 text-white rounded"
                  onClick={() => {
                    playSe('click');
                    resolveCall('pon');
                  }}
                >
                  ポン
                </button>
              )}
              {callPrompt.kan && (
                <button
                  className="px-3 py-2 bg-purple-500 text-white rounded"
                  onClick={() => {
                    playSe('click');
                    resolveCall('kan');
                  }}
                >
                  カン
                </button>
              )}
              {callPrompt.chiOptions.map((opt, idx) => (
                <button
                  key={idx}
                  className="px-3 py-2 bg-green-500 text-white rounded"
                  onClick={() => {
                    playSe('click');
                    resolveCall('chi', opt);
                  }}
                >
                  チー: {opt.join(' ')}
                </button>
              ))}
              <button
                className="px-3 py-2 bg-gray-300 rounded"
                onClick={() => {
                  playSe('click');
                  resolveCall('pass');
                }}
              >
                スルー
              </button>
            </div>
          </div>
        </div>
      )}

      {kanSelectOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30">
          <div className="bg-white text-gray-900 p-4 rounded shadow-lg w-[92vw] max-w-sm">
            <p className="font-bold mb-3">カンする牌を選んでください</p>
            <div className="flex flex-wrap gap-2">
              {kanCandidates.map((c) => (
                <button
                  key={`${c.kind}-${c.base}`}
                  className="px-3 py-2 bg-purple-500 text-white rounded flex items-center gap-2"
                  onClick={() => {
                    playSe('click');
                    setKanSelectOpen(false);
                    declareKan(c.base);
                  }}
                >
                  <Tile tileId={c.base} className="w-7 h-10 sm:w-8 sm:h-12 shadow-none cursor-default transform-none" />
                  <span className="text-[11px] font-bold bg-black/30 px-2 py-0.5 rounded">
                    {c.kind === 'ankan' ? '暗槓' : '加槓'}
                  </span>
                  <span className="font-mono">{c.base}</span>
                </button>
              ))}
              <button
                className="px-3 py-2 bg-gray-300 rounded"
                onClick={() => {
                  playSe('click');
                  setKanSelectOpen(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {winPrompt && !roundResult && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30">
          <div className="bg-white text-gray-900 p-4 rounded shadow-lg w-[92vw] max-w-sm">
            <p className="font-bold mb-3">ツモしますか？</p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-2 bg-gray-200 rounded"
                onClick={() => {
                  playSe('click');
                  resolveWinPrompt(false);
                }}
              >
                いいえ
              </button>
              <button
                className="px-3 py-2 bg-blue-600 text-white rounded"
                onClick={() => {
                  playSe('click');
                  resolveWinPrompt(true);
                }}
              >
                はい
              </button>
            </div>
          </div>
        </div>
      )}

      {roundResult && (
        <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-30">
          <p className="text-4xl font-bold mb-4">{overlayTitle}</p>
          <p className="mb-4 text-xl">{round?.label}</p>
          {resultDetails && (
            <div className="bg-white/10 border border-white/20 rounded-lg px-5 py-4 mb-4 text-left w-[360px] max-w-[92vw]">
              <p className="text-2xl font-bold mb-3 text-center">{resultDetails.title}</p>

              {roundResult.reason === 'ryuukyoku' ? (
                <div className="space-y-3">
                  <p className="text-sm text-green-100 text-center">{resultDetails.body}</p>
                  {showOpponentHandOnRyukyoku && opponentHandOnRyukyoku && (
                    <div>
                      <p className="text-sm font-bold text-green-50 mb-1">ずんだもんの手牌（テンパイ）</p>
                      <div className="bg-black/20 rounded px-3 py-2 overflow-x-auto">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => scrollHandRow(opponentRyukyokuHandRef, 'left')}
                            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white/90 hover:bg-black/70"
                            aria-label="左へスクロール"
                          >
                            ←
                          </button>
                          <div
                            ref={opponentRyukyokuHandRef}
                            className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar w-full"
                          >
                            {opponentHandOnRyukyoku.map((tile, i) => (
                              <Tile
                                key={`${tile}-${i}`}
                                tileId={tile}
                                className="w-12 h-[72px] sm:w-14 sm:h-[84px] shadow-none cursor-default transform-none"
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => scrollHandRow(opponentRyukyokuHandRef, 'right')}
                            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white/90 hover:bg-black/70"
                            aria-label="右へスクロール"
                          >
                            →
                          </button>
                        </div>
                        {opponentMelds.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-green-50/80 mb-1">鳴き</p>
                            <div className="flex flex-wrap gap-2">
                              {opponentMelds.map((m, idx) => (
                                <div key={`${m.type}-${idx}`} className="bg-white/10 rounded px-2 py-1">
                                  <MeldView meld={m} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <p className="text-sm font-bold text-green-50 mb-1">役</p>
                    {roundResult.score?.yaku?.length ? (
                      <ul className="text-sm text-green-100 space-y-1">
                        {roundResult.score.yaku.map((y, idx) => (
                          <li key={`${y.name}-${idx}`}>{y.name}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-green-100">なし</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-green-100">
                    <div className="bg-black/20 rounded px-3 py-2">
                      <p className="text-xs text-green-50/80">符・翻</p>
                      <p className="font-bold">
                        {roundResult.score?.fu ?? 0}符 {roundResult.score?.han ?? 0}翻
                      </p>
                    </div>
                    <div className="bg-black/20 rounded px-3 py-2">
                      <p className="text-xs text-green-50/80">点数区分</p>
                      <p className="font-bold">{roundResult.score?.limitName ?? '—'}</p>
                    </div>
                    <div className="bg-black/20 rounded px-3 py-2 col-span-2">
                      <p className="text-xs text-green-50/80">獲得点数</p>
                      <p className="font-bold text-lg">{roundResult.points}点</p>
                      <p className="text-xs text-green-50/70 mt-1">{resultDetails.body}</p>
                      <div className="text-xs text-green-50/70 mt-2 space-y-1">
                        <p>
                          内訳: 役の点 {roundResult.handPoints}点 + 本場 {roundResult.honbaPoints}点
                        </p>
                        {roundResult.kyotakuPoints > 0 && <p>供託回収: +{roundResult.kyotakuPoints}点</p>}
                      </div>
                    </div>
                  </div>

                  {roundResult.winner === 'opponent' && (
                    <div className="mt-3">
                      <p className="text-sm font-bold text-green-50 mb-1">ずんだもんの手牌</p>
                      <div className="bg-black/20 rounded px-3 py-2 overflow-x-auto">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => scrollHandRow(opponentResultHandRef, 'left')}
                            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white/90 hover:bg-black/70"
                            aria-label="左へスクロール"
                          >
                            ←
                          </button>
                          <div
                            ref={opponentResultHandRef}
                            className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar w-full"
                          >
                            {opponentHand.map((tile, i) => (
                              <Tile
                                key={`${tile}-${i}`}
                                tileId={tile}
                                className="w-12 h-[72px] sm:w-14 sm:h-[84px] shadow-none cursor-default transform-none"
                              />
                            ))}
                            {opponentWinTileForReveal && (
                              <div className="ml-2 flex items-center gap-2">
                                <span className="text-[11px] text-green-50/80 whitespace-nowrap">
                                  {roundResult.reason === 'tsumo' ? 'ツモ牌' : 'ロン牌'}
                                </span>
                                <Tile
                                  tileId={opponentWinTileForReveal}
                                  className="w-12 h-[72px] sm:w-14 sm:h-[84px] shadow-none cursor-default transform-none ring-2 ring-yellow-300"
                                />
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => scrollHandRow(opponentResultHandRef, 'right')}
                            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white/90 hover:bg-black/70"
                            aria-label="右へスクロール"
                          >
                            →
                          </button>
                        </div>

                        {opponentMelds.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-green-50/80 mb-1">鳴き</p>
                            <div className="flex flex-wrap gap-2">
                              {opponentMelds.map((m, idx) => (
                                <div key={`${m.type}-${idx}`} className="bg-white/10 rounded px-2 py-1">
                                  <MeldView meld={m} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {roundResult.score?.yaku?.some((y) => y.name === '立直' || y.name === 'ダブル立直') ? (
                    <div className="mt-3">
                      <p className="text-xs text-green-50/80 mb-1">裏ドラ表示牌</p>
                      <div className="flex gap-1 flex-nowrap overflow-x-auto no-scrollbar">
                        {uraIndicators.map((t, i) => (
                          <Tile key={`${t}-${i}`} tileId={t} className="cursor-default transform-none" />
                        ))}
                      </div>
                      <p className="text-xs text-green-50/70 mt-1">裏ドラ: {uraDoraTiles.join(', ') || 'なし'}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {gameState !== 'match_end' && (
            <button
              onClick={() => {
                playSe('click');
                resetZundaText();
                nextRound();
              }}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-bold shadow-lg"
            >
              次へ
            </button>
          )}

          {gameState === 'match_end' && !roundResult.applied && (
            <button
              onClick={() => {
                playSe('click');
                resetZundaText();
                nextRound();
              }}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-bold shadow-lg"
            >
              次へ
            </button>
          )}

          {gameState === 'match_end' && roundResult.applied && (
            <div className="text-center">
              <p className="text-2xl mb-2">
                {scores.player === scores.opponent ? '引き分け' : scores.player > scores.opponent ? 'あなたの勝ち！' : 'ずんだもんの勝ち！'}
              </p>
              {isFinalWinnerDecided && (
                <div className="flex flex-wrap gap-2 justify-center mb-3">
                  <button
                    onClick={() => {
                      playSe('click');
                      handleShareToX();
                    }}
                    className="px-5 py-2 rounded-lg font-bold border border-white/30 bg-black/30 hover:bg-black/20"
                  >
                    X に投稿
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  playSe('click');
                  resetZundaText();
                  playZundaVoice('start');
                  startGame();
                }}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-bold shadow-lg"
              >
                もう一度
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
