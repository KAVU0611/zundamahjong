import { useCallback, useEffect, useMemo, useState } from 'react';
import { calculateScore, nextDoraTile, type ScoreResult, type WinMethod } from '../lib/mahjong/scoring';

export type TileId = string;

export type GameState =
  | 'waiting'
  | 'player_turn'
  | 'opponent_turn'
  | 'round_end'
  | 'match_end';

type Player = 'player' | 'opponent';

type MeldType = 'pon' | 'chi' | 'kan';

type Meld = {
  type: MeldType;
  tiles: TileId[];
};

export type Reaction = 'none' | 'reach' | 'ron' | 'tsumo' | 'ryuukyoku';

type CallPrompt = {
  from: Player;
  tile: TileId;
  canRon: boolean;
  pon: boolean;
  kan: boolean;
  chiOptions: TileId[][];
};

type WinPrompt = {
  method: 'tsumo';
  tile: TileId;
  key: string;
};

type RoundInfo = {
  label: string;
  dealer: Player;
};

const ROUNDS: RoundInfo[] = [
  { label: '東1局', dealer: 'player' },
  { label: '東2局', dealer: 'opponent' },
  { label: '南1局', dealer: 'player' },
  { label: '南2局', dealer: 'opponent' },
];

const INITIAL_POINTS = 25000;
const MAX_JUN = 18; // 約17~18巡で流局

const TILE_TYPES = {
  m: 9,
  p: 9,
  s: 9,
  z: 7,
};

const allTileIds: TileId[] = (() => {
  const ids: TileId[] = [];
  for (const [suit, count] of Object.entries(TILE_TYPES)) {
    for (let i = 1; i <= count; i++) {
      ids.push(`${suit}${i}`);
    }
  }
  return ids;
})();

const createInitialWall = (): TileId[] => {
  const wall: TileId[] = [];
  for (const id of allTileIds) {
    for (let i = 0; i < 4; i++) wall.push(id);
  }
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
};

const sortHand = (a: TileId, b: TileId) => a.localeCompare(b);

const cloneCounts = (counts: Record<string, number>) => ({ ...counts });

const countTiles = (tiles: TileId[]) => {
  const counts: Record<string, number> = {};
  for (const t of tiles) counts[t] = (counts[t] || 0) + 1;
  return counts;
};

const canFormSets = (counts: Record<string, number>): boolean => {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return true;
  const [tile, ct] = entries[0];
  const nextCounts = cloneCounts(counts);

  if (ct >= 3) {
    nextCounts[tile] -= 3;
    if (canFormSets(nextCounts)) return true;
    nextCounts[tile] = ct; // revert
  }

  const suit = tile[0];
  const num = parseInt(tile.slice(1), 10);
  if (suit !== 'z') {
    const t1 = `${suit}${num + 1}`;
    const t2 = `${suit}${num + 2}`;
    if (nextCounts[t1] > 0 && nextCounts[t2] > 0) {
      nextCounts[tile]--;
      nextCounts[t1]--;
      nextCounts[t2]--;
      if (canFormSets(nextCounts)) return true;
    }
  }
  return false;
};

const isSevenPairs = (tiles: TileId[]) => {
  if (tiles.length !== 14) return false;
  const counts = countTiles(tiles);
  return Object.values(counts).every((v) => v === 2);
};

const isWinningHand = (tiles: TileId[]) => {
  // melds are already complete sets
  if (tiles.length % 3 !== 2) return false;
  if (isSevenPairs(tiles)) return true;
  const counts = countTiles(tiles);
  for (const [tile, ct] of Object.entries(counts)) {
    if (ct >= 2) {
      const rest = cloneCounts(counts);
      rest[tile] -= 2;
      if (canFormSets(rest)) return true;
    }
  }
  return false;
};

const isTenpai = (hand: TileId[], melds: Meld[]) => {
  if (melds.length > 0) return false; // 門前のみリーチ可
  const tiles = allTileIds;
  return tiles.some((tile) => isWinningHand([...hand, tile]));
};

const canDeclareRiichiFromHand = (baseHand: TileId[], drawn: TileId | null, melds: Meld[], alreadyRiichi: boolean) => {
  if (alreadyRiichi) return false;
  if (melds.length > 0) return false; // 門前のみ
  const fullHand = drawn ? [...baseHand, drawn] : [...baseHand];

  // 13枚ならそのままテンパイ判定、14枚なら「どれか1枚切ってテンパイになれるか」を判定
  if (fullHand.length === 13) return isTenpai(fullHand, melds);
  if (fullHand.length === 14) {
    return fullHand.some((_, index) => {
      const afterDiscard = fullHand.filter((__, j) => j !== index);
      return isTenpai(afterDiscard, melds);
    });
  }
  return false;
};

const getChiOptions = (hand: TileId[], tile?: TileId | null): TileId[][] => {
  if (!tile) return [];
  const suit = tile[0];
  const num = parseInt(tile.slice(1), 10);
  if (suit === 'z') return [];
  const options: TileId[][] = [];
  const patterns = [
    [num - 2, num - 1, num],
    [num - 1, num, num + 1],
    [num, num + 1, num + 2],
  ];
  for (const p of patterns) {
    if (p.some((n) => n < 1 || n > 9)) continue;
    const tilesNeeded = p.map((n) => `${suit}${n}`);
    const counts = countTiles(hand);
    let ok = true;
    for (const id of tilesNeeded.filter((t) => t !== tile)) {
      if ((counts[id] || 0) <= 0) {
        ok = false;
        break;
      }
      counts[id]--;
    }
    if (ok) options.push(tilesNeeded);
  }
  return options;
};

const canPon = (hand: TileId[], tile: TileId) => (countTiles(hand)[tile] || 0) >= 2;
const canKanFromDiscard = (hand: TileId[], tile: TileId) => (countTiles(hand)[tile] || 0) >= 3;

const getWinningTiles = (hand: TileId[]) => {
  const waits = new Set<TileId>();
  for (const tile of allTileIds) {
    if (isWinningHand([...hand, tile])) waits.add(tile);
  }
  return Array.from(waits);
};

const isFuriten = (hand: TileId[], river: TileId[]) => {
  if (!river.length) return false;
  const waits = getWinningTiles(hand);
  return waits.some((tile) => river.includes(tile));
};

const getRoundWind = (label: string): TileId => (label.startsWith('東') ? 'z1' : 'z2');

export const useMahjong = () => {
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [roundIndex, setRoundIndex] = useState(0);
  const [honba, setHonba] = useState(0);
  const [kyotaku, setKyotaku] = useState(0); // 供託リーチ棒(1000点)の本数
  const [wall, setWall] = useState<TileId[]>([]);
  const [deadWall, setDeadWall] = useState<TileId[]>([]);
  const [doraIndicators, setDoraIndicators] = useState<TileId[]>([]);
  const [uraIndicators, setUraIndicators] = useState<TileId[]>([]);
  const [drawCount, setDrawCount] = useState(0);

  const [playerHand, setPlayerHand] = useState<TileId[]>([]);
  const [opponentHand, setOpponentHand] = useState<TileId[]>([]);
  const [playerMelds, setPlayerMelds] = useState<Meld[]>([]);
  const [opponentMelds, setOpponentMelds] = useState<Meld[]>([]);
  const [playerRiver, setPlayerRiver] = useState<TileId[]>([]);
  const [opponentRiver, setOpponentRiver] = useState<TileId[]>([]);
  const [playerDrawn, setPlayerDrawn] = useState<TileId | null>(null);
  const [opponentDrawn, setOpponentDrawn] = useState<TileId | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Player | null>(null);
  const [skipDraw, setSkipDraw] = useState(false);
  const [riichiState, setRiichiState] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [riichiIntent, setRiichiIntent] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [riichiDeclarationIndex, setRiichiDeclarationIndex] = useState<{ player: number | null; opponent: number | null }>({
    player: null,
    opponent: null,
  });
  const [calledRiverIndices, setCalledRiverIndices] = useState<{ player: number[]; opponent: number[] }>({
    player: [],
    opponent: [],
  });
  const [scores, setScores] = useState<{ player: number; opponent: number }>({
    player: INITIAL_POINTS,
    opponent: INITIAL_POINTS,
  });
  const [callPrompt, setCallPrompt] = useState<CallPrompt | null>(null);
  const [winPrompt, setWinPrompt] = useState<WinPrompt | null>(null);
  const [declinedWinKey, setDeclinedWinKey] = useState<string | null>(null);
  const [roundResult, setRoundResult] = useState<
    | null
    | {
        winner: Player | null;
        loser: Player | null;
        reason: 'tsumo' | 'ron' | 'ryuukyoku' | null;
        points: number; // loser->winner の支払い（役の点＋本場分）
        handPoints: number;
        honbaPoints: number;
        kyotakuPoints: number; // 供託（winnerのみ加算）
        honba: number;
        kyotaku: number;
        score: ScoreResult | null;
        method: WinMethod | null;
        applied: boolean;
      }
  >(null);
  const [reaction, setReaction] = useState<Reaction>('none');

  const round = ROUNDS[roundIndex];
  const doraTiles = useMemo(() => doraIndicators.map(nextDoraTile), [doraIndicators]);
  const uraDoraTiles = useMemo(() => uraIndicators.map(nextDoraTile), [uraIndicators]);
  const canRiichi = useMemo(
    () => ({
      player: canDeclareRiichiFromHand(playerHand, playerDrawn, playerMelds, riichiState.player),
      opponent: canDeclareRiichiFromHand(opponentHand, opponentDrawn, opponentMelds, riichiState.opponent),
    }),
    [playerHand, playerDrawn, playerMelds, riichiState.player, opponentHand, opponentDrawn, opponentMelds, riichiState.opponent],
  );

  const resetRoundState = useCallback(() => {
    setWall([]);
    setDeadWall([]);
    setDoraIndicators([]);
    setUraIndicators([]);
    setDrawCount(0);
    setPlayerHand([]);
    setOpponentHand([]);
    setPlayerMelds([]);
    setOpponentMelds([]);
    setPlayerRiver([]);
    setOpponentRiver([]);
    setPlayerDrawn(null);
    setOpponentDrawn(null);
    setCurrentTurn(null);
    setSkipDraw(false);
    setRiichiState({ player: false, opponent: false });
    setRiichiIntent({ player: false, opponent: false });
    setRiichiDeclarationIndex({ player: null, opponent: null });
    setCalledRiverIndices({ player: [], opponent: [] });
    setCallPrompt(null);
    setWinPrompt(null);
    setDeclinedWinKey(null);
    setRoundResult(null);
    setReaction('none');
  }, []);

  const startRound = useCallback(
    (nextIndex?: number) => {
      const index = nextIndex ?? roundIndex;
      const info = ROUNDS[index];
      const shuffled = createInitialWall();
      const wallWithoutDead = shuffled.slice(0, -14);
      const dead = shuffled.slice(-14);

      // ドラ表示牌・裏ドラ表示牌をランダムに選ぶ（王牌内）
      const indicatorIndex = Math.floor(Math.random() * dead.length);
      const indicator = dead[indicatorIndex];
      const remainingDead = [...dead];
      remainingDead.splice(indicatorIndex, 1);
      const uraIndex = Math.floor(Math.random() * remainingDead.length);
      const ura = remainingDead[uraIndex];
      remainingDead.splice(uraIndex, 1);

      const newWall = [...wallWithoutDead];
      const playerInit = newWall.splice(0, 13).sort(sortHand);
      const opponentInit = newWall.splice(0, 13).sort(sortHand);
      const firstDraw = newWall.shift();

      resetRoundState();
      setWall(newWall);
      setDeadWall(remainingDead);
      setDoraIndicators([indicator]);
      setUraIndicators([ura]);
      setPlayerHand(info.dealer === 'player' ? playerInit : opponentInit);
      setOpponentHand(info.dealer === 'player' ? opponentInit : playerInit);
      if (info.dealer === 'player') {
        setPlayerDrawn(firstDraw || null);
        setCurrentTurn('player');
      } else {
        setOpponentDrawn(firstDraw || null);
        setCurrentTurn('opponent');
      }
      setGameState(info.dealer === 'player' ? 'player_turn' : 'opponent_turn');
    },
    [resetRoundState, roundIndex],
  );

  const startGame = useCallback(() => {
    setScores({ player: INITIAL_POINTS, opponent: INITIAL_POINTS });
    setRoundIndex(0);
    setHonba(0);
    setKyotaku(0);
    startRound(0);
  }, [startRound]);

  const remainingJun = useMemo(() => Math.max(0, MAX_JUN * 2 - drawCount), [drawCount]);

  const handleReaction = useCallback((type: Reaction) => setReaction(type), []);

  const markCalledDiscard = useCallback((who: Player, index: number) => {
    setCalledRiverIndices((c) => {
      const current = new Set(c[who]);
      current.add(index);
      return { ...c, [who]: Array.from(current).sort((a, b) => a - b) };
    });
  }, []);

  const declareRiichi = useCallback(
    (who: Player, riverIndex: number) => {
      let alreadyDeclared = false;
      setRiichiState((r) => {
        if (r[who]) {
          alreadyDeclared = true;
          return r;
        }
        return { ...r, [who]: true };
      });
      if (alreadyDeclared) return;
      setRiichiIntent((i) => ({ ...i, [who]: false }));
      setRiichiDeclarationIndex((idx) => ({ ...idx, [who]: riverIndex }));
      setScores((s) => ({ ...s, [who]: s[who] - 1000 }));
      setKyotaku((k) => k + 1);
      handleReaction('reach');
    },
    [handleReaction],
  );

  const revealDoraIndicator = useCallback(() => {
    setDeadWall((dw) => {
      if (dw.length < 2) return dw;
      const next = [...dw];
      const ura = next.pop()!;
      const ind = next.pop()!;
      setDoraIndicators((d) => [...d, ind]);
      setUraIndicators((u) => [...u, ura]);
      return next;
    });
  }, []);

  const endRound = useCallback(
    (opts: {
      winner: Player | null;
      loser: Player | null;
      reason: 'tsumo' | 'ron' | 'ryuukyoku';
      points: number;
      handPoints: number;
      honbaPoints: number;
      kyotakuPoints: number;
      honba: number;
      kyotaku: number;
      score: ScoreResult | null;
      method: WinMethod | null;
      willRepeat: boolean;
    }) => {
      setRoundResult({ ...opts, applied: opts.winner ? false : true });
      const isLastRound = roundIndex === ROUNDS.length - 1;
      setGameState(isLastRound && !opts.willRepeat ? 'match_end' : 'round_end');
      if (opts.reason === 'ryuukyoku') handleReaction('ryuukyoku');
      if (opts.reason === 'ron') handleReaction('ron');
      if (opts.reason === 'tsumo') handleReaction('tsumo');
    },
    [roundIndex, handleReaction],
  );

  const nextRound = useCallback(() => {
    // Result overlay "Next": apply point transfer first.
    setScores((s) => {
      if (!roundResult?.winner || !roundResult.loser || roundResult.applied) return s;
      const delta = roundResult.points;
      if (delta <= 0) return s;
      const winner = roundResult.winner;
      const loser = roundResult.loser;
      return {
        ...s,
        [winner]: s[winner] + delta + roundResult.kyotakuPoints,
        [loser]: s[loser] - delta,
      };
    });
    setRoundResult((r) => (r ? { ...r, applied: true } : r));
    if (!roundResult) return;

    // 供託はアガリで回収（流局は持ち越し）
    if (roundResult.winner && !roundResult.applied) {
      setKyotaku(0);
    }

    const dealer = round.dealer;
    const willRepeat = roundResult.reason === 'ryuukyoku' || (!!roundResult.winner && roundResult.winner === dealer);
    if (willRepeat) {
      setHonba((h) => h + 1);
      startRound(roundIndex);
      return;
    }

    // 連荘しない場合：本場リセットして次局へ
    setHonba(0);
    if (roundIndex === ROUNDS.length - 1) return;
    const idx = roundIndex + 1;
    setRoundIndex(idx);
    startRound(idx);
  }, [roundIndex, startRound, roundResult, round.dealer]);

  const checkRyukyoku = useCallback(() => {
    if (!wall.length || drawCount >= MAX_JUN * 2) {
      endRound({
        winner: null,
        loser: null,
        reason: 'ryuukyoku',
        points: 0,
        handPoints: 0,
        honbaPoints: 0,
        kyotakuPoints: 0,
        honba,
        kyotaku,
        score: null,
        method: null,
        willRepeat: true,
      });
      return true;
    }
    return false;
  }, [wall.length, drawCount, endRound, honba, kyotaku]);

  const drawTileFor = useCallback(
    (who: Player) => {
      if (checkRyukyoku()) return null;
      if (!wall.length) return null;

      const [tile, ...rest] = wall;
      setWall(rest);
      setDrawCount((c) => c + 1);

      if (who === 'player') setPlayerDrawn(tile);
      else setOpponentDrawn(tile);

      return tile;
    },
    [checkRyukyoku, wall],
  );

  const handleRiichi = useCallback(
    (who: Player): boolean => {
      if (riichiState[who]) return false;
      if (riichiIntent[who]) {
        setRiichiIntent((i) => ({ ...i, [who]: false }));
        return false;
      }
      const hand = who === 'player' ? playerHand : opponentHand;
      const drawn = who === 'player' ? playerDrawn : opponentDrawn;
      const melds = who === 'player' ? playerMelds : opponentMelds;
      if (!canDeclareRiichiFromHand(hand, drawn, melds, false)) return false;
      setRiichiIntent((i) => ({ ...i, [who]: true }));
      return true;
    },
    [riichiState, riichiIntent, playerHand, opponentHand, playerDrawn, opponentDrawn, playerMelds, opponentMelds],
  );

  const handleWin = useCallback(
    (winner: Player, reason: 'tsumo' | 'ron', winTile: TileId) => {
      const loser: Player = winner === 'player' ? 'opponent' : 'player';
      const winnerHand = winner === 'player' ? playerHand : opponentHand;
      const winnerMelds = winner === 'player' ? playerMelds : opponentMelds;

      const isDealer = round.dealer === winner;
      const seatWind: TileId = isDealer ? 'z1' : 'z2';
      const roundWind = getRoundWind(round.label);
      const score = calculateScore({
        concealedTiles: [...winnerHand, winTile],
        melds: winnerMelds,
        method: reason,
        isDealer,
        isRiichi: riichiState[winner],
        doraIndicators,
        uraIndicators,
        roundWind,
        seatWind,
        winTile,
      });

      const handPoints = score.totalPoints;
      const honbaPoints = honba * 300;
      const kyotakuPoints = kyotaku * 1000;
      const willRepeat = isDealer; // 親のアガリは連荘

      endRound({
        winner,
        loser,
        reason,
        points: handPoints + honbaPoints,
        handPoints,
        honbaPoints,
        kyotakuPoints,
        honba,
        kyotaku,
        score,
        method: reason,
        willRepeat,
      });
    },
    [
      endRound,
      playerHand,
      opponentHand,
      playerMelds,
      opponentMelds,
      round.dealer,
      round.label,
      riichiState,
      doraIndicators,
      uraIndicators,
      honba,
      kyotaku,
    ],
  );

  const canRonOnDiscard = useCallback(
    (who: Player, tile: TileId) => {
      const hand = who === 'player' ? playerHand : opponentHand;
      const river = who === 'player' ? playerRiver : opponentRiver;
      if (isFuriten(hand, river)) return false;
      return isWinningHand([...hand, tile]);
    },
    [playerHand, opponentHand, playerRiver, opponentRiver],
  );

  const promptCallForPlayer = useCallback(
    (tile: TileId) => {
      if (!tile) return false;
      const canRon = canRonOnDiscard('player', tile);
      if (riichiState.player) {
        if (!canRon) return false;
        setCallPrompt({
          from: 'opponent',
          tile,
          canRon,
          pon: false,
          kan: false,
          chiOptions: [],
        });
        return true;
      }
      const chiOptions = getChiOptions(playerHand, tile);
      const pon = canPon(playerHand, tile);
      const kan = canKanFromDiscard(playerHand, tile);
      if (chiOptions.length || pon || kan || canRon) {
        setCallPrompt({
          from: 'opponent',
          tile,
          canRon,
          pon,
          kan,
          chiOptions,
        });
        return true;
      }
      return false;
    },
    [playerHand, canRonOnDiscard, riichiState.player],
  );

  const resolveCall = useCallback(
    (type: MeldType | 'ron' | 'pass', option?: TileId[]) => {
      if (!callPrompt) return;
      const tile = callPrompt.tile;
      setCallPrompt(null);

      if (type === 'ron') {
        handleWin('player', 'ron', tile);
        return;
      }
      if (type === 'pass') {
        setCurrentTurn('player');
        setSkipDraw(false);
        setGameState('player_turn');
        return;
      }

      const nextHand = [...playerHand];
      let meldToAdd: Meld | null = null;

      if (type === 'pon') {
        for (let i = 0; i < 2; i++) nextHand.splice(nextHand.indexOf(tile), 1);
        meldToAdd = { type: 'pon', tiles: [tile, tile, tile] };
      } else if (type === 'kan') {
        for (let i = 0; i < 3; i++) nextHand.splice(nextHand.indexOf(tile), 1);
        meldToAdd = { type: 'kan', tiles: [tile, tile, tile, tile] };
      } else if (type === 'chi' && option) {
        for (const t of option.filter((t) => t !== tile)) {
          const idx = nextHand.indexOf(t);
          if (idx >= 0) nextHand.splice(idx, 1);
        }
        meldToAdd = { type: 'chi', tiles: option };
      }

      if (meldToAdd) setPlayerMelds((m) => [...m, meldToAdd]);
      setPlayerHand(nextHand);

      const calledIndex = opponentRiver.length ? opponentRiver.length - 1 : null;
      if (calledIndex !== null) {
        markCalledDiscard('opponent', calledIndex);
      }

      setSkipDraw(true);
      setCurrentTurn('player');
      setGameState('player_turn');

      if (type === 'kan') {
        revealDoraIndicator();
        drawTileFor('player'); // 嶺上
        setSkipDraw(false);
      }
    },
    [callPrompt, handleWin, drawTileFor, revealDoraIndicator, playerHand, opponentRiver, markCalledDiscard],
  );

  const discardTile = useCallback(
    (tileIndex: number, fromDrawn: boolean) => {
      if (gameState !== 'player_turn') return;
      if (playerDrawn === null && !skipDraw) return;
      setWinPrompt(null);
      setDeclinedWinKey(null);

      let discard: TileId | null = null;
      const newHand = [...playerHand];
      if (fromDrawn) {
        discard = playerDrawn;
        setPlayerDrawn(null);
      } else {
        discard = newHand.splice(tileIndex, 1)[0];
        if (playerDrawn) {
          newHand.push(playerDrawn);
          newHand.sort(sortHand);
          setPlayerDrawn(null);
        }
      }
      if (!discard) return;
      setPlayerHand(newHand);
      const discardIndex = playerRiver.length;
      setPlayerRiver((r) => [...r, discard!]);
      if (riichiIntent.player && !riichiState.player) {
        // リーチ宣言準備中でも、切った後にテンパイを崩した場合はリーチしない（準備は解除）
        if (isTenpai(newHand, playerMelds)) {
          declareRiichi('player', discardIndex);
        } else {
          setRiichiIntent((i) => ({ ...i, player: false }));
        }
      }

      // 相手のロン判定
      if (canRonOnDiscard('opponent', discard)) {
        handleWin('opponent', 'ron', discard);
        return;
      }

      // 相手鳴き判定
      const opponentChi = getChiOptions(opponentHand, discard);
      const opponentPon = canPon(opponentHand, discard);
      const opponentKan = canKanFromDiscard(opponentHand, discard);

      if (opponentPon || opponentKan || opponentChi.length) {
        const choose = opponentKan ? 'kan' : opponentPon ? 'pon' : opponentChi.length ? 'chi' : null;
        if (choose === 'kan') {
          const tile = discard;
          const newHand = [...opponentHand];
          for (let i = 0; i < 3; i++) newHand.splice(newHand.indexOf(tile), 1);
          setOpponentHand(newHand);
          setOpponentMelds((m) => [...m, { type: 'kan', tiles: [tile, tile, tile, tile] }]);
          markCalledDiscard('player', discardIndex);
          revealDoraIndicator();
          drawTileFor('opponent');
          setSkipDraw(true);
          setCurrentTurn('opponent');
          setGameState('opponent_turn');
          return;
        }
        if (choose === 'pon') {
          const tile = discard;
          const newHand = [...opponentHand];
          for (let i = 0; i < 2; i++) newHand.splice(newHand.indexOf(tile), 1);
          setOpponentHand(newHand);
          setOpponentMelds((m) => [...m, { type: 'pon', tiles: [tile, tile, tile] }]);
          markCalledDiscard('player', discardIndex);
          setSkipDraw(true);
          setCurrentTurn('opponent');
          setGameState('opponent_turn');
          return;
        }
        if (choose === 'chi') {
          const option = opponentChi[0];
          const newHand = [...opponentHand];
          for (const t of option.filter((t) => t !== discard)) {
            const idx = newHand.indexOf(t);
            if (idx >= 0) newHand.splice(idx, 1);
          }
          setOpponentHand(newHand);
          setOpponentMelds((m) => [...m, { type: 'chi', tiles: option }]);
          markCalledDiscard('player', discardIndex);
          setSkipDraw(true);
          setCurrentTurn('opponent');
          setGameState('opponent_turn');
          return;
        }
      }

      // 通常進行
      if (checkRyukyoku()) return;
      setSkipDraw(false);
      setCurrentTurn('opponent');
      setGameState('opponent_turn');
    },
    [
      gameState,
      playerDrawn,
      skipDraw,
      playerHand,
      playerRiver,
      riichiIntent.player,
      riichiState.player,
      playerMelds,
      opponentHand,
      canRonOnDiscard,
      handleWin,
      checkRyukyoku,
      drawTileFor,
      revealDoraIndicator,
      declareRiichi,
      markCalledDiscard,
    ],
  );

  const opponentDiscard = useCallback(
    (drawnTile?: TileId | null, intentToDeclareRiichi?: boolean): TileId | null => {
      const tile = drawnTile ?? opponentDrawn;
      const fullHand = tile ? [...opponentHand, tile] : [...opponentHand];
      if (!fullHand.length) return null;
      const discardIndex = Math.floor(Math.random() * fullHand.length);
      const discard = fullHand.splice(discardIndex, 1)[0];
      setOpponentHand(fullHand.sort(sortHand));
      setOpponentDrawn(null);
      const riverIndex = opponentRiver.length;
      setOpponentRiver((r) => [...r, discard]);
      if ((intentToDeclareRiichi || riichiIntent.opponent) && !riichiState.opponent) {
        if (isTenpai(fullHand, opponentMelds)) {
          declareRiichi('opponent', riverIndex);
        } else {
          setRiichiIntent((i) => ({ ...i, opponent: false }));
        }
      }
      return discard;
    },
    [opponentHand, opponentDrawn, opponentRiver, riichiIntent.opponent, riichiState.opponent, declareRiichi, opponentMelds],
  );

  const opponentTurn = useCallback(() => {
    if (callPrompt) return;
    if (gameState !== 'opponent_turn') return;

    let drawnTile: TileId | null = opponentDrawn;
    let declaredIntent = false;

    // ツモチェック
    if (!skipDraw) {
      if (!drawnTile) {
        drawnTile = drawTileFor('opponent');
      }
      if (!drawnTile) return;
      const hand = [...opponentHand, drawnTile];
      if (isWinningHand(hand)) {
        handleWin('opponent', 'tsumo', drawnTile);
        return;
      }
      // リーチ判定
      if (!opponentMelds.length && isTenpai(hand, opponentMelds) && !riichiState.opponent) {
        declaredIntent = handleRiichi('opponent');
      }
    } else {
      setSkipDraw(false);
    }

    const discardedTile = opponentDiscard(drawnTile, declaredIntent);
    if (!discardedTile) return;

    // プレイヤーの反応
    if (canRonOnDiscard('player', discardedTile)) {
      setCallPrompt({
        from: 'opponent',
        tile: discardedTile,
        canRon: true,
        pon: false,
        kan: false,
        chiOptions: [],
      });
      return;
    }
    if (promptCallForPlayer(discardedTile)) return;

    if (checkRyukyoku()) return;
    setCurrentTurn('player');
    setGameState('player_turn');
    drawTileFor('player');
  }, [
    gameState,
    skipDraw,
    drawTileFor,
    opponentHand,
    opponentMelds,
    handleWin,
    riichiState.opponent,
    handleRiichi,
    opponentDiscard,
    canRonOnDiscard,
    promptCallForPlayer,
    checkRyukyoku,
    callPrompt,
    opponentDrawn,
  ]);

  useEffect(() => {
    if (gameState !== 'opponent_turn' || callPrompt) return;
    const timer = setTimeout(() => opponentTurn(), 600);
    return () => clearTimeout(timer);
  }, [gameState, callPrompt, opponentTurn]);

  useEffect(() => {
    if (gameState === 'player_turn' && !playerDrawn && !skipDraw) {
      // 自動ツモ処理（巡目に入った直後に1枚引く）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      drawTileFor('player');
    }
  }, [gameState, playerDrawn, skipDraw, drawTileFor]);

  useEffect(() => {
    if (gameState !== 'player_turn') return;
    if (!playerDrawn) return;
    if (!isWinningHand([...playerHand, playerDrawn])) return;
    const key = `tsumo-${playerDrawn}-${drawCount}`;
    if (declinedWinKey === key) return;
    if (winPrompt?.key === key) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWinPrompt({ method: 'tsumo', tile: playerDrawn, key });
  }, [gameState, playerDrawn, playerHand, drawCount, declinedWinKey, winPrompt?.key]);

  const resolveWinPrompt = useCallback(
    (accept: boolean) => {
      if (!winPrompt) return;
      if (accept) {
        handleWin('player', 'tsumo', winPrompt.tile);
        return;
      }
      setDeclinedWinKey(winPrompt.key);
      setWinPrompt(null);
    },
    [winPrompt, handleWin],
  );

  return {
    // 状態
    gameState,
    round,
    scores,
    honba,
    kyotaku,
    wall,
    deadWall,
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

    // アクション
    startGame,
    nextRound,
    discardTile,
    resolveCall,
    resolveWinPrompt,
    handleRiichi,
  };
};
