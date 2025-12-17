'use client';

import React from 'react';
import Image from 'next/image';
import { useMahjong, TileId } from '../hooks/useMahjong';
import { useSounds } from '../hooks/useSounds';

const TILE_ID_TO_IMAGE_MAP: Record<string, string> = {
  m1: 'Man1',
  m2: 'Man2',
  m3: 'Man3',
  m4: 'Man4',
  m5: 'Man5',
  m6: 'Man6',
  m7: 'Man7',
  m8: 'Man8',
  m9: 'Man9',
  p1: 'Pin1',
  p2: 'Pin2',
  p3: 'Pin3',
  p4: 'Pin4',
  p5: 'Pin5',
  p6: 'Pin6',
  p7: 'Pin7',
  p8: 'Pin8',
  p9: 'Pin9',
  s1: 'Sou1',
  s2: 'Sou2',
  s3: 'Sou3',
  s4: 'Sou4',
  s5: 'Sou5',
  s6: 'Sou6',
  s7: 'Sou7',
  s8: 'Sou8',
  s9: 'Sou9',
  z1: 'Ton',
  z2: 'Nan',
  z3: 'Shaa',
  z4: 'Pei',
  z5: 'Haku',
  z6: 'Hatsu',
  z7: 'Chun',
};

const tileBaseId = (tileId: TileId): TileId => tileId.split('_')[0]!;
const getTilePath = (tileId: TileId): string => `/tiles/${TILE_ID_TO_IMAGE_MAP[tileBaseId(tileId)]}.png`;

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
    'w-8 h-12 sm:w-10 sm:h-14 rounded-md shadow-md cursor-pointer select-none touch-manipulation transform transition-transform sm:hover:-translate-y-1 active:translate-y-0';
  const thicknessStyle = 'border-b-4 border-gray-400';
  const emphasisStyle = muted ? 'opacity-60 saturate-75' : '';
  const orientationStyle = horizontal ? 'rotate-90 origin-center' : '';

  if (isBack) {
    return (
      <div className={`${baseStyle} ${thicknessStyle} ${orientationStyle} relative ${className}`}>
        <Image src="/tiles/Back.png" alt="Tile back" fill className="object-cover rounded-md" />
      </div>
    );
  }

  if (!tileId) return null;

  return (
    <div
      onClick={onClick}
      className={`${baseStyle} ${thicknessStyle} relative bg-white ${emphasisStyle} ${orientationStyle} ${className}`}
    >
      <Image src="/tiles/Front.png" alt="Tile front base" fill className="absolute inset-0 w-full h-full rounded-md" />
      <Image src={getTilePath(tileId)} alt={tileBaseId(tileId)} fill className="relative z-10 w-full h-full object-contain p-1" />
    </div>
  );
};

type MeldData = { type: 'pon' | 'chi' | 'kan'; tiles: TileId[] };

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

const Zundamon: React.FC<{ mode: keyof typeof ZUNDAMON_STATES }> = ({ mode }) => {
  const state = ZUNDAMON_STATES[mode] || ZUNDAMON_STATES.waiting;
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-28 h-28 sm:w-36 sm:h-36 relative">
        <Image src={`/zunda/${state.img}`} alt="Zundamon" fill className="object-contain" />
      </div>
      <div className="mt-2 p-2 bg-white rounded-lg shadow-md text-center text-gray-800 max-w-[92vw]">
        <p className="text-sm sm:text-base">{state.text}</p>
      </div>
    </div>
  );
};

const MeldView: React.FC<{ tiles: TileId[] }> = ({ tiles }) => {
  return (
    <div className="flex gap-1">
      {tiles.map((t, i) => (
        <Tile key={`${t}-${i}`} tileId={t} className="cursor-default transform-none" />
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
              <MeldView tiles={m.tiles} />
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-600">なし</p>
        )}
      </div>
    </div>
  );
};

export default function MahjongPage() {
  const {
    gameState,
    round,
    scores,
    honba,
    kyotaku,
    wall,
    doraIndicators,
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
    canAddKan,
    addKanFromPon,
    resolveCall,
    resolveWinPrompt,
    handleRiichi,
  } = useMahjong();

  const { playSe, playVoice } = useSounds();
  const isPlayerDealer = round?.dealer === 'player';
  const isOpponentDealer = round?.dealer === 'opponent';
  const [ronConfirmOpen, setRonConfirmOpen] = React.useState(false);
  const prevOpponentMeldCountRef = React.useRef(0);
  const prevOpponentRiichiRef = React.useRef(false);
  const prevOpponentRiichiIntentRef = React.useRef(false);
  const prevPlayerRiverCountRef = React.useRef(0);
  const prevOpponentRiverCountRef = React.useRef(0);
  const prevRoundResultKeyRef = React.useRef<string | null>(null);
  const slowWarnedRef = React.useRef(false);

  React.useEffect(() => {
    if (!callPrompt) setRonConfirmOpen(false);
  }, [callPrompt]);

  React.useEffect(() => {
    const prev = prevOpponentMeldCountRef.current;
    if (opponentMelds.length > prev) {
      const last = opponentMelds[opponentMelds.length - 1];
      if (last?.type === 'pon') playVoice('zunda_pon');
      if (last?.type === 'chi') playVoice('zunda_chi');
      if (last?.type === 'kan') playVoice('zunda_kan');
    }
    prevOpponentMeldCountRef.current = opponentMelds.length;
  }, [opponentMelds, playVoice]);

  React.useEffect(() => {
    const prev = prevOpponentRiichiRef.current;
    if (!prev && riichiState.opponent) playVoice('zunda_riichi');
    prevOpponentRiichiRef.current = riichiState.opponent;
  }, [riichiState.opponent, playVoice]);

  React.useEffect(() => {
    // 相手のリーチ準備（テンパイ気配）
    const prev = prevOpponentRiichiIntentRef.current;
    if (!prev && riichiIntent.opponent && !riichiState.opponent) playVoice('zunda_tenpai');
    prevOpponentRiichiIntentRef.current = riichiIntent.opponent;
  }, [riichiIntent.opponent, riichiState.opponent, playVoice]);

  React.useEffect(() => {
    const prevCount = prevPlayerRiverCountRef.current;
    if (playerRiver.length > prevCount) {
      const last = playerRiver[playerRiver.length - 1];
      if (last && doraTiles.includes(tileBaseId(last))) playVoice('zunda_dora');
    }
    prevPlayerRiverCountRef.current = playerRiver.length;
  }, [playerRiver, doraTiles, playVoice]);

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
      return;
    }
    const key = `${roundResult.reason}-${roundResult.winner ?? 'none'}-${roundResult.loser ?? 'none'}`;
    if (prevRoundResultKeyRef.current === key) return;
    prevRoundResultKeyRef.current = key;

    if (roundResult.reason === 'tsumo' || roundResult.reason === 'ron' || roundResult.reason === 'ryuukyoku') {
      playSe('win');
      if (roundResult.winner === 'opponent') {
        playVoice(roundResult.reason === 'tsumo' ? 'zunda_tsumo' : 'zunda_ron');
      }
    }
  }, [roundResult, playSe, playVoice]);

  React.useEffect(() => {
    if (gameState !== 'player_turn') {
      slowWarnedRef.current = false;
      return;
    }
    if (slowWarnedRef.current) return;
    const t = setTimeout(() => {
      if (gameState !== 'player_turn') return;
      slowWarnedRef.current = true;
      playVoice('zunda_slow');
    }, 12000);
    return () => clearTimeout(t);
  }, [gameState, playVoice]);

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

  return (
    <main className="flex flex-col items-center min-h-[100dvh] bg-green-800 text-white p-2 sm:p-3 font-sans overflow-x-hidden">
      <div className="w-full max-w-5xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-sm text-green-100">{round?.label ?? '---'}</p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">ずんだ麻雀（2人打ち）</h1>
            <p className="text-xs text-green-100">東1→東2→南1→南2で終了。山が枯れたら流局。</p>
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
              playVoice('zunda_start');
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
              <div className="flex flex-nowrap items-center gap-1 bg-green-950/40 rounded-lg px-2 py-1 border border-green-700/50 overflow-x-auto max-w-full">
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
                  key={i}
                  tileId={tile}
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

              <div className="order-1 sm:order-2 flex flex-col items-center gap-1">
                <Zundamon mode={reaction === 'none' ? (gameState as keyof typeof ZUNDAMON_STATES) : reaction} />
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
                  key={i}
                  tileId={tile}
                  muted={calledRiverIndices.player.includes(i)}
                  horizontal={riichiDeclarationIndex.player === i}
                  className="w-7 h-10 sm:w-8 sm:h-12 shadow-none cursor-default transform-none"
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="w-full flex flex-col items-stretch gap-2 sm:gap-3 bg-green-950/40 rounded-lg px-2 sm:px-3 py-2 border border-green-700/40">
              <div className="flex items-center gap-1 flex-nowrap overflow-x-auto">
                {playerHand.map((tile, i) => (
                  <Tile
                    key={`${tile}-${i}`}
                    tileId={tile}
                    onClick={
                      gameState === 'player_turn' && !riichiState.player
                        ? () => {
                            playSe('discard');
                            discardTile(i, false);
                          }
                        : undefined
                    }
                    className={
                      gameState !== 'player_turn' || riichiState.player ? 'opacity-60 cursor-not-allowed sm:hover:translate-y-0 transform-none' : ''
                    }
                  />
                ))}
                {playerDrawn && (
                  <div className="ml-2 sm:ml-3">
                    <Tile
                      tileId={playerDrawn}
                      onClick={
                        gameState === 'player_turn'
                          ? () => {
                              playSe('discard');
                              discardTile(0, true);
                            }
                          : undefined
                      }
                      className={gameState !== 'player_turn' ? 'opacity-60 cursor-not-allowed sm:hover:translate-y-0 transform-none' : ''}
                    />
                  </div>
                )}
              </div>
              <MeldZone title="あなたの鳴き牌" melds={playerMelds} />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {canAddKan && (
                <button
                  onClick={() => {
                    playSe('click');
                    addKanFromPon();
                  }}
                  disabled={gameState !== 'player_turn'}
                  className={`px-4 py-2 rounded font-bold border bg-purple-500 text-white border-purple-700 hover:bg-purple-400 ${
                    gameState !== 'player_turn' ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  加カン
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
      {callPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20">
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
                    setRonConfirmOpen(true);
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

      {callPrompt && ronConfirmOpen && callPrompt.canRon && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30">
          <div className="bg-white text-gray-900 p-4 rounded shadow-lg w-[92vw] max-w-sm">
            <p className="font-bold mb-3">ロンしますか？</p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-2 bg-gray-200 rounded"
                onClick={() => {
                  playSe('click');
                  setRonConfirmOpen(false);
                }}
              >
                いいえ
              </button>
              <button
                className="px-3 py-2 bg-red-500 text-white rounded"
                onClick={() => {
                  playSe('click');
                  setRonConfirmOpen(false);
                  resolveCall('ron');
                }}
              >
                はい
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
                <p className="text-sm text-green-100 text-center">{resultDetails.body}</p>
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

                  {roundResult.score?.uraDoraHan ? (
                    <p className="text-xs text-green-50/70 mt-3">
                      裏ドラ候補: {uraDoraTiles.join(', ') || '—'}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}

          {gameState !== 'match_end' && (
            <button
              onClick={() => {
                playSe('click');
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
              <button
                onClick={() => {
                  playSe('click');
                  playVoice('zunda_start');
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
