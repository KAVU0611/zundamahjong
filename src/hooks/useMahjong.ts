import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateScore, nextDoraTile, type ScoreResult, type WinMethod } from '../lib/mahjong/scoring';
import { createShuffledWall } from '../lib/mahjong/wall';
import { allTileBases, calculateShantenFromCounts, counts34FromBases, tileBaseToIndex } from '../lib/mahjong/shanten';

export type TileId = string;
type RiverEntry = { id: string; tileId: TileId | null; base: string; isRed: boolean; called: boolean };

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
  // 暗槓など、門前扱いのカン
  concealed?: boolean;
};

type KanKind = 'ankan' | 'kakan';
export type KanCandidate = { kind: KanKind; base: TileId };

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
const RIICHI_COST = 1000;
const TOBI_END_THRESHOLD = -100;

const TILE_TYPES = {
  m: 9,
  p: 9,
  s: 9,
  z: 7,
};

const parseTileId = (tileId: TileId): { base: TileId; isRed: boolean } => {
  // New format: `${type}-${number}-${index}` (e.g. man-5-0)
  const dashParts = tileId.split('-');
  if (dashParts.length >= 3) {
    const [type, numStr, indexStr] = dashParts;
    const number = parseInt(numStr ?? '', 10);
    const index = parseInt(indexStr ?? '', 10);
    const suit = type === 'man' ? 'm' : type === 'pin' ? 'p' : type === 'sou' ? 's' : type === 'honor' ? 'z' : null;
    if (suit && Number.isFinite(number)) {
      const base = `${suit}${number}`;
      const isRed = (type === 'man' || type === 'pin' || type === 'sou') && number === 5 && index === 0;
      return { base, isRed };
    }
  }
  // Legacy formats: `m5_0`, `m5_dora_0`, or base like `m5`
  const base = tileId.split('_')[0]!;
  const isRed = tileId.includes('_dora_') || tileId.endsWith('_dora') || tileId.endsWith('_red');
  return { base, isRed };
};

const tileBase = (tileId: TileId): TileId => parseTileId(tileId).base;
const isRedTile = (tileId: TileId) => parseTileId(tileId).isRed;

const allTileIds: TileId[] = (() => {
  const ids: TileId[] = [];
  for (const [suit, count] of Object.entries(TILE_TYPES)) {
    for (let i = 1; i <= count; i++) {
      ids.push(`${suit}${i}`);
    }
  }
  return ids;
})();

const sortHand = (a: TileId, b: TileId) => a.localeCompare(b);

const cloneCounts = (counts: Record<string, number>) => ({ ...counts });

const countTiles = (tiles: TileId[]) => {
  const counts: Record<string, number> = {};
  for (const t of tiles) {
    const base = tileBase(t);
    counts[base] = (counts[base] || 0) + 1;
  }
  return counts;
};

const removeTilesByBase = (tiles: TileId[], baseTile: TileId, n: number): TileId[] => {
  const removed: TileId[] = [];
  for (let i = tiles.length - 1; i >= 0 && removed.length < n; i--) {
    if (tileBase(tiles[i]!) === baseTile) {
      removed.push(tiles.splice(i, 1)[0]!);
    }
  }
  return removed;
};

const removeOneTileByBase = (tiles: TileId[], baseTile: TileId): TileId | null => {
  const removed = removeTilesByBase(tiles, baseTile, 1);
  return removed.length ? removed[0]! : null;
};

const findPonMeldIndexByBase = (melds: Meld[], baseTileId: TileId): number => {
  const target = tileBase(baseTileId);
  return melds.findIndex((m) => m.type === 'pon' && m.tiles.some((t) => tileBase(t) === target));
};

const canFormSets = (counts: Record<string, number>): boolean => {
  const tile = allTileIds.find((t) => (counts[t] || 0) > 0);
  if (!tile) return true;
  const ct = counts[tile] || 0;
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

const isWinningHandWithMeldCount = (concealedTiles: TileId[], meldCount: number) => {
  const requiredSets = 4 - meldCount;
  if (requiredSets < 0) return false;
  if (concealedTiles.length !== requiredSets * 3 + 2) return false;
  if (meldCount === 0 && isSevenPairs(concealedTiles)) return true;

  const counts = countTiles(concealedTiles);
  for (const [tile, ct] of Object.entries(counts)) {
    if (ct < 2) continue;
    const rest = cloneCounts(counts);
    rest[tile] -= 2;
    if (canFormSets(rest)) return true;
  }
  return false;
};

const isTenpaiWithMeldCount = (hand: TileId[], meldCount: number) =>
  allTileIds.some((tile) => isWinningHandWithMeldCount([...hand, tile], meldCount));

const getWinningTilesWithMeldCount = (hand: TileId[], meldCount: number) => {
  const waits = new Set<TileId>();
  for (const tile of allTileIds) {
    if (isWinningHandWithMeldCount([...hand, tile], meldCount)) waits.add(tile);
  }
  return waits;
};

const isTenpaiWithDrawn = (hand: TileId[], drawn: TileId | null, meldCount: number) => {
  const fullHand = drawn ? [...hand, drawn] : [...hand];

  // 1枚待ち判定（13枚相当: 13,10,7...）
  if (fullHand.length % 3 === 1) return isTenpaiWithMeldCount(fullHand, meldCount);

  // ツモって14枚相当なら、どれか1枚切ってテンパイに残れるかで判定
  if (fullHand.length % 3 === 2) {
    return fullHand.some((_, index) => {
      const afterDiscard = fullHand.filter((__, j) => j !== index);
      return isTenpaiWithMeldCount(afterDiscard, meldCount);
    });
  }

  return false;
};

const canDeclareRiichiFromHand = (baseHand: TileId[], drawn: TileId | null, melds: Meld[], alreadyRiichi: boolean) => {
  if (alreadyRiichi) return false;
  // 門前のみ（暗槓は門前扱い）
  const hasOpenCall = melds.some((m) => m.type !== 'kan' || !m.concealed);
  if (hasOpenCall) return false;
  const fullHand = drawn ? [...baseHand, drawn] : [...baseHand];
  const meldCount = melds.length;

  // 13枚相当(≡1 mod 3)ならそのままテンパイ判定、
  // 14枚相当(≡2 mod 3)なら「どれか1枚切ってテンパイになれるか」を判定
  if (fullHand.length % 3 === 1) return isTenpaiWithMeldCount(fullHand, meldCount);
  if (fullHand.length % 3 === 2) return isTenpaiWithDrawn(baseHand, drawn, meldCount);
  return false;
};

const getChiOptions = (hand: TileId[], tile?: TileId | null): TileId[][] => {
  if (!tile) return [];
  const base = tileBase(tile);
  const suit = base[0];
  const num = parseInt(base.slice(1), 10);
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
    for (const id of tilesNeeded.filter((t) => t !== base)) {
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

const canPon = (hand: TileId[], tile: TileId) => (countTiles(hand)[tileBase(tile)] || 0) >= 2;
const canKanFromDiscard = (hand: TileId[], tile: TileId) => (countTiles(hand)[tileBase(tile)] || 0) >= 3;

const isHonorBase = (base: TileId) => base[0] === 'z';
const baseNumber = (base: TileId) => parseInt(base.slice(1), 10);
const isTerminalBase = (base: TileId) => !isHonorBase(base) && (baseNumber(base) === 1 || baseNumber(base) === 9);
const isSimpleBase = (base: TileId) => !isHonorBase(base) && baseNumber(base) >= 2 && baseNumber(base) <= 8;
const isTerminalOrHonorBase = (base: TileId) => isHonorBase(base) || isTerminalBase(base);
const countDoraTiles = (tiles: TileId[], doraList: TileId[]) => {
  let total = 0;
  for (const t of tiles) {
    const base = tileBase(t);
    if (doraList.includes(base)) total++;
    if (isRedTile(t)) total++;
  }
  return total;
};

const countPairsInHand = (hand: TileId[]) => {
  const counts = countTiles(hand);
  return Object.values(counts).filter((ct) => ct >= 2).length;
};

const isFuriten = (hand: TileId[], river: RiverEntry[], meldCount: number) => {
  if (!river.length) return false;
  const riverBases = new Set(river.map((r) => r.base));
  const waits = getWinningTilesWithMeldCount(hand, meldCount);
  for (const tile of waits) {
    if (riverBases.has(tile)) return true;
  }
  return false;
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

  const wallRef = useRef<TileId[]>([]);
  const deadWallRef = useRef<TileId[]>([]);
  const doraIndicatorsRef = useRef<TileId[]>([]);
  const uraIndicatorsRef = useRef<TileId[]>([]);
  const kanActionLockRef = useRef(false);
  const riichiWaitsRef = useRef<{ player: TileId[] | null; opponent: TileId[] | null }>({ player: null, opponent: null });
  const rinshanEligibleRef = useRef<{ player: boolean; opponent: boolean }>({ player: false, opponent: false });

  const [playerHand, setPlayerHand] = useState<TileId[]>([]);
  const [opponentHand, setOpponentHand] = useState<TileId[]>([]);
  const [playerMelds, setPlayerMelds] = useState<Meld[]>([]);
  const [opponentMelds, setOpponentMelds] = useState<Meld[]>([]);
  const [playerRiver, setPlayerRiver] = useState<RiverEntry[]>([]);
  const [opponentRiver, setOpponentRiver] = useState<RiverEntry[]>([]);
  const [playerDrawn, setPlayerDrawn] = useState<TileId | null>(null);
  const [opponentDrawn, setOpponentDrawn] = useState<TileId | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Player | null>(null);
  const [skipDraw, setSkipDraw] = useState(false);
  const [riichiState, setRiichiState] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [doubleRiichiState, setDoubleRiichiState] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [ippatsuEligible, setIppatsuEligible] = useState<{ player: boolean; opponent: boolean }>({
    player: false,
    opponent: false,
  });
  const [anyCallMade, setAnyCallMade] = useState(false);
  const [kuikaeForbiddenBase, setKuikaeForbiddenBase] = useState<{ player: TileId | null; opponent: TileId | null }>({
    player: null,
    opponent: null,
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
        willRepeat: boolean;
        applied: boolean;
      }
  >(null);
  const [reaction, setReaction] = useState<Reaction>('none');

  const round = ROUNDS[roundIndex];
  const doraTiles = useMemo(() => doraIndicators.map(nextDoraTile), [doraIndicators]);
  const uraDoraTiles = useMemo(() => uraIndicators.map(nextDoraTile), [uraIndicators]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    // Round init/transition uses multiple setState calls; validate only during active turns to avoid transient false positives.
    if (gameState !== 'player_turn' && gameState !== 'opponent_turn') return;

    const tiles: TileId[] = [];
    tiles.push(...wall);
    tiles.push(...deadWall);
    tiles.push(...doraIndicators);
    tiles.push(...uraIndicators);
    tiles.push(...playerHand);
    tiles.push(...opponentHand);
    if (playerDrawn) tiles.push(playerDrawn);
    if (opponentDrawn) tiles.push(opponentDrawn);
    tiles.push(...playerMelds.flatMap((m) => m.tiles));
    tiles.push(...opponentMelds.flatMap((m) => m.tiles));
    tiles.push(...playerRiver.filter((r) => !r.called).map((r) => r.base));
    tiles.push(...opponentRiver.filter((r) => !r.called).map((r) => r.base));

    const counts = countTiles(tiles);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    // `resetRoundState()`直後など、一瞬だけ全部空になるタイミングがあるので無視する。
    if (total === 0) return;
    const over = Object.entries(counts).filter(([, ct]) => ct > 4);
    if (over.length) {
      // eslint-disable-next-line no-console
      console.error('Tile integrity violation (>4 copies):', over);
    }

    if (total !== 136) {
      // eslint-disable-next-line no-console
      console.error(`Tile integrity violation (total != 136): ${total}`);
    }
  }, [
    gameState,
    wall,
    deadWall,
    doraIndicators,
    uraIndicators,
    playerHand,
    opponentHand,
    playerDrawn,
    opponentDrawn,
    playerMelds,
    opponentMelds,
    playerRiver,
    opponentRiver,
  ]);
  const canRiichi = useMemo(
    () => ({
      player: canDeclareRiichiFromHand(playerHand, playerDrawn, playerMelds, riichiState.player),
      opponent: canDeclareRiichiFromHand(opponentHand, opponentDrawn, opponentMelds, riichiState.opponent),
    }),
    [playerHand, playerDrawn, playerMelds, riichiState.player, opponentHand, opponentDrawn, opponentMelds, riichiState.opponent],
  );

  const resetRoundState = useCallback(() => {
    wallRef.current = [];
    deadWallRef.current = [];
    doraIndicatorsRef.current = [];
    uraIndicatorsRef.current = [];
    kanActionLockRef.current = false;
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
    setDoubleRiichiState({ player: false, opponent: false });
    setIppatsuEligible({ player: false, opponent: false });
    setAnyCallMade(false);
    setKuikaeForbiddenBase({ player: null, opponent: null });
    setRiichiIntent({ player: false, opponent: false });
    setRiichiDeclarationIndex({ player: null, opponent: null });
    setCalledRiverIndices({ player: [], opponent: [] });
    riichiWaitsRef.current = { player: null, opponent: null };
    rinshanEligibleRef.current = { player: false, opponent: false };
    setCallPrompt(null);
    setWinPrompt(null);
    setDeclinedWinKey(null);
    setRoundResult(null);
    setReaction('none');
  }, []);

  const riverSeqRef = useRef(0);
  const makeRiverEntry = useCallback((tileId: TileId): RiverEntry => {
    const parsed = parseTileId(tileId);
    const displayId =
      parsed.isRed && (parsed.base === 'm5' || parsed.base === 'p5' || parsed.base === 's5')
        ? `${parsed.base}_red`
        : parsed.base;
    return {
      id: `river-${riverSeqRef.current++}`,
      tileId: displayId,
      base: parsed.base,
      isRed: parsed.isRed,
      called: false,
    };
  }, []);

  const startRound = useCallback(
    (nextIndex?: number) => {
      const index = nextIndex ?? roundIndex;
      const info = ROUNDS[index];

      // Reset first to avoid transient states where the wallRef is cleared after we set it.
      resetRoundState();

      const shuffled = createShuffledWall();
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

      const liveWall = [...wallWithoutDead];
      const playerInit = liveWall.splice(0, 13).sort(sortHand);
      const opponentInit = liveWall.splice(0, 13).sort(sortHand);
      const firstDraw = liveWall.shift();
      wallRef.current = liveWall;

      setWall([...wallRef.current]);
      deadWallRef.current = [...remainingDead];
      doraIndicatorsRef.current = [indicator];
      uraIndicatorsRef.current = [ura];
      setDeadWall([...deadWallRef.current]);
      setDoraIndicators([...doraIndicatorsRef.current]);
      setUraIndicators([...uraIndicatorsRef.current]);
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

    const mark = (river: RiverEntry[]) =>
      river.map((entry, i) => (i === index ? { ...entry, called: true, tileId: null } : entry));
    if (who === 'player') setPlayerRiver(mark);
    else setOpponentRiver(mark);
  }, []);

  const declareRiichi = useCallback(
    (who: Player, riverIndex: number, lockedHand: TileId[]) => {
      // 900点以下はリーチできない（= 1000点未満では供託が払えない）
      if ((scores[who] ?? 0) < RIICHI_COST) return;
      let alreadyDeclared = false;
      setRiichiState((r) => {
        if (r[who]) {
          alreadyDeclared = true;
          return r;
        }
        return { ...r, [who]: true };
      });
      if (alreadyDeclared) return;
      const isDoubleRiichi = riverIndex === 0 && !anyCallMade;
      setDoubleRiichiState((d) => ({ ...d, [who]: isDoubleRiichi }));
      setIppatsuEligible((i) => ({ ...i, [who]: true }));
      setRiichiIntent((i) => ({ ...i, [who]: false }));
      setRiichiDeclarationIndex((idx) => ({ ...idx, [who]: riverIndex }));
      setScores((s) => ({ ...s, [who]: s[who] - RIICHI_COST }));
      setKyotaku((k) => k + 1);
      riichiWaitsRef.current = {
        ...riichiWaitsRef.current,
        [who]: Array.from(getWinningTilesWithMeldCount(lockedHand, 0)).sort(),
      };
      handleReaction('reach');
    },
    [handleReaction, anyCallMade, scores],
  );

  const cancelIppatsu = useCallback(() => {
    setIppatsuEligible({ player: false, opponent: false });
  }, []);

  const noteCallMade = useCallback(() => {
    setAnyCallMade(true);
    cancelIppatsu();
  }, [cancelIppatsu]);

  const revealDoraIndicator = useCallback(() => {
    if (deadWallRef.current.length < 2) return;
    const nextDead = [...deadWallRef.current];
    const ura = nextDead.pop()!;
    const ind = nextDead.pop()!;
    deadWallRef.current = nextDead;
    doraIndicatorsRef.current = [...doraIndicatorsRef.current, ind];
    uraIndicatorsRef.current = [...uraIndicatorsRef.current, ura];
    setDeadWall([...deadWallRef.current]);
    setDoraIndicators([...doraIndicatorsRef.current]);
    setUraIndicators([...uraIndicatorsRef.current]);
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
    if (!roundResult) return;
    const tobi = (s: { player: number; opponent: number }) => s.player <= TOBI_END_THRESHOLD || s.opponent <= TOBI_END_THRESHOLD;

    if (roundResult?.winner && roundResult.loser && !roundResult.applied) {
      const delta = roundResult.points;
      if (delta > 0) {
        const winner = roundResult.winner;
        const loser = roundResult.loser;
        const nextScores = {
          ...scores,
          [winner]: scores[winner] + delta + roundResult.kyotakuPoints,
          [loser]: scores[loser] - delta,
        };
        setScores(nextScores);
        setRoundResult((r) => (r ? { ...r, applied: true } : r));

        // 供託はアガリで回収（流局は持ち越し）
        setKyotaku(0);

        // トビあり：どちらかが -100 以下になったら即終了
        if (tobi(nextScores)) {
          setGameState('match_end');
          return;
        }
      } else {
        setRoundResult((r) => (r ? { ...r, applied: true } : r));
      }
    }

    const willRepeat = roundResult.willRepeat;
    if (roundResult.reason === 'ryuukyoku') {
      // 流局は親がテンパイなら連荘、ノーテンなら親流れ。どちらも本場は加算。
      setHonba((h) => h + 1);
      if (willRepeat) {
        startRound(roundIndex);
        return;
      }
      if (roundIndex === ROUNDS.length - 1) return;
      const idx = roundIndex + 1;
      setRoundIndex(idx);
      startRound(idx);
      return;
    }

    if (willRepeat) {
      // 親のアガリは連荘（本場加算）
      setHonba((h) => h + 1);
      startRound(roundIndex);
      return;
    }

    // 親が流れたら本場リセットして次局へ
    setHonba(0);
    if (roundIndex === ROUNDS.length - 1) return;
    const idx = roundIndex + 1;
    setRoundIndex(idx);
    startRound(idx);
  }, [roundIndex, scores, startRound, roundResult]);

  const checkRyukyoku = useCallback(() => {
    if (!wallRef.current.length || drawCount >= MAX_JUN * 2) {
      const dealer = round.dealer;
      const dealerHand = dealer === 'player' ? playerHand : opponentHand;
      const dealerDrawn = dealer === 'player' ? playerDrawn : opponentDrawn;
      const dealerMeldCount = dealer === 'player' ? playerMelds.length : opponentMelds.length;
      const dealerTenpai = isTenpaiWithDrawn(dealerHand, dealerDrawn, dealerMeldCount);
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
        willRepeat: dealerTenpai,
      });
      return true;
    }
    return false;
  }, [
    drawCount,
    endRound,
    honba,
    kyotaku,
    round.dealer,
    playerHand,
    opponentHand,
    playerMelds.length,
    opponentMelds.length,
    playerDrawn,
    opponentDrawn,
  ]);

  const drawTileFor = useCallback(
    (who: Player) => {
      if (checkRyukyoku()) return null;
      const tile = wallRef.current.shift();
      if (!tile) return null;
      setWall([...wallRef.current]);
      setDrawCount((c) => c + 1);

      if (who === 'player') setPlayerDrawn(tile);
      else setOpponentDrawn(tile);

      return tile;
    },
    [checkRyukyoku],
  );

  const drawNormalTileFor = useCallback(
    (who: Player) => {
      rinshanEligibleRef.current = { ...rinshanEligibleRef.current, [who]: false };
      return drawTileFor(who);
    },
    [drawTileFor],
  );

  const drawRinshanTileFor = useCallback(
    (who: Player) => {
      rinshanEligibleRef.current = { ...rinshanEligibleRef.current, [who]: true };
      return drawTileFor(who);
    },
    [drawTileFor],
  );

  const handleRiichi = useCallback(
    (who: Player): boolean => {
      if (riichiState[who]) return false;
      if (riichiIntent[who]) {
        setRiichiIntent((i) => ({ ...i, [who]: false }));
        return false;
      }
      // 900点以下はリーチできない
      if ((scores[who] ?? 0) < RIICHI_COST) return false;
      const hand = who === 'player' ? playerHand : opponentHand;
      const drawn = who === 'player' ? playerDrawn : opponentDrawn;
      const melds = who === 'player' ? playerMelds : opponentMelds;
      if (!canDeclareRiichiFromHand(hand, drawn, melds, false)) return false;
      setRiichiIntent((i) => ({ ...i, [who]: true }));
      return true;
    },
    [riichiState, riichiIntent, scores, playerHand, opponentHand, playerDrawn, opponentDrawn, playerMelds, opponentMelds],
  );

  const handleWin = useCallback(
    (winner: Player, reason: 'tsumo' | 'ron', winTile: TileId) => {
      // Ensure any pending prompts are cleared; otherwise UI may re-show "Ron?" after accepting.
      setCallPrompt(null);
      setWinPrompt(null);
      setDeclinedWinKey(null);

      const loser: Player = winner === 'player' ? 'opponent' : 'player';
      const winnerHand = winner === 'player' ? playerHand : opponentHand;
      const winnerMelds = winner === 'player' ? playerMelds : opponentMelds;

      const isDealer = round.dealer === winner;
      const seatWind: TileId = isDealer ? 'z1' : 'z2';
      const roundWind = getRoundWind(round.label);
      const isDoubleRiichi = doubleRiichiState[winner];
      const isIppatsu = ippatsuEligible[winner];
      const remaining = Math.max(0, MAX_JUN * 2 - drawCount);
      const isHaitei = reason === 'tsumo' && remaining === 0;
      const isHoutei = reason === 'ron' && remaining === 0;
      const isRinshan = reason === 'tsumo' && rinshanEligibleRef.current[winner];
      const score = calculateScore({
        concealedTiles: [...winnerHand, winTile],
        melds: winnerMelds,
        method: reason,
        isDealer,
        isRiichi: riichiState[winner],
        isDoubleRiichi,
        isIppatsu,
        isHaitei,
        isHoutei,
        isRinshan,
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
      doubleRiichiState,
      ippatsuEligible,
      doraIndicators,
      uraIndicators,
      drawCount,
      honba,
      kyotaku,
    ],
  );

  const canWinWithYaku = useCallback(
    (who: Player, method: WinMethod, winTile: TileId) => {
      const hand = who === 'player' ? playerHand : opponentHand;
      const melds = who === 'player' ? playerMelds : opponentMelds;

      // アガリ形になっていなければ不可
      if (!isWinningHandWithMeldCount([...hand, winTile], melds.length)) return false;

      const isDealer = round.dealer === who;
      const seatWind: TileId = isDealer ? 'z1' : 'z2';
      const roundWind = getRoundWind(round.label);
      const isDoubleRiichi = doubleRiichiState[who];
      const isIppatsu = ippatsuEligible[who];
      const remaining = Math.max(0, MAX_JUN * 2 - drawCount);
      const isHaitei = method === 'tsumo' && remaining === 0;
      const isHoutei = method === 'ron' && remaining === 0;
      const isRinshan = method === 'tsumo' && rinshanEligibleRef.current[who];

      const score = calculateScore({
        concealedTiles: [...hand, winTile],
        melds,
        method,
        isDealer,
        isRiichi: riichiState[who],
        isDoubleRiichi,
        isIppatsu,
        isHaitei,
        isHoutei,
        isRinshan,
        doraIndicators,
        uraIndicators,
        roundWind,
        seatWind,
        winTile,
      });

      return score.baseYaku.length > 0;
    },
    [
      playerHand,
      opponentHand,
      playerMelds,
      opponentMelds,
      round.dealer,
      round.label,
      doubleRiichiState,
      ippatsuEligible,
      drawCount,
      riichiState,
      doraIndicators,
      uraIndicators,
    ],
  );

  const shouldOpponentCall = useCallback(
    (discard: TileId) => {
      // リーチ後は鳴けない（ロン以外）。※暗槓のみ別途処理
      if (riichiState.opponent) return null;
      const discardBase = tileBase(discard);

      const seatWind: TileId = round.dealer === 'opponent' ? 'z1' : 'z2';
      const roundWind = getRoundWind(round.label);
      const isValueTile = (base: TileId) =>
        base === 'z5' || base === 'z6' || base === 'z7' || base === seatWind || base === roundWind;

      const allSimpleIfCall = (() => {
        const tiles = [
          ...opponentHand.map(tileBase),
          ...opponentMelds.flatMap((m) => m.tiles.map(tileBase)),
          discardBase,
        ];
        return tiles.length > 0 && tiles.every((b) => isSimpleBase(b));
      })();

      const pairs = countPairsInHand(opponentHand);

      const canPonNow = canPon(opponentHand, discardBase);
      const canKanNow = canKanFromDiscard(opponentHand, discardBase);
      const chiOptions = getChiOptions(opponentHand, discardBase);

      const allowYakuhai = isValueTile(discardBase);
      const allowTanyao = allSimpleIfCall;
      const allowToitoi = pairs >= 3 && canPonNow;

      // Condition A: yakuhai (only pon/kan on value tile)
      if (allowYakuhai) {
        if (canKanNow) return { type: 'kan' as const };
        if (canPonNow) return { type: 'pon' as const };
      }

      // Condition C: toitoi (pon only)
      if (allowToitoi) {
        return { type: 'pon' as const };
      }

      // Condition B: tanyao (pon/kan/chi allowed, but only if the called set stays in simples)
      if (allowTanyao) {
        if (canKanNow) return { type: 'kan' as const };
        if (canPonNow) return { type: 'pon' as const };
        const simpleChi = chiOptions.find((opt) => opt.every((b) => isSimpleBase(b)));
        if (simpleChi) return { type: 'chi' as const, option: simpleChi };
      }

      return null;
    },
    [opponentHand, opponentMelds, round.dealer, round.label, riichiState.opponent],
  );

  const canRonOnDiscard = useCallback(
    (who: Player, tile: TileId) => {
      const hand = who === 'player' ? playerHand : opponentHand;
      const meldCount = who === 'player' ? playerMelds.length : opponentMelds.length;
      const river = who === 'player' ? playerRiver : opponentRiver;
      if (isFuriten(hand, river, meldCount)) return false;
      return canWinWithYaku(who, 'ron', tile);
    },
    [playerHand, opponentHand, playerMelds.length, opponentMelds.length, playerRiver, opponentRiver, canWinWithYaku],
  );

  const canPlayerRiichiAnkan = useCallback(
    (base: TileId): boolean => {
      if (!riichiState.player) return true;
      if (!playerDrawn) return false;

      const b = tileBase(base);
      if (tileBase(playerDrawn) !== b) return false;

      // 送りカン防止：リーチ時は「手牌に3枚」+「ツモって4枚目」だけ許可
      const handCounts = countTiles(playerHand);
      if ((handCounts[b] ?? 0) !== 3) return false;

      const riichiWaits = riichiWaitsRef.current.player;
      if (!riichiWaits) return false;

      // 暗槓後も待ちが変わらないこと（233334m のような形を弾く）
      const nextHand = [...playerHand];
      const removed = removeTilesByBase(nextHand, b, 3);
      if (removed.length !== 3) return false;
      const meldCountAfter = playerMelds.length + 1;
      const waitsAfter = Array.from(getWinningTilesWithMeldCount(nextHand, meldCountAfter)).sort();

      if (waitsAfter.length !== riichiWaits.length) return false;
      for (let i = 0; i < waitsAfter.length; i++) {
        if (waitsAfter[i] !== riichiWaits[i]) return false;
      }
      return true;
    },
    [riichiState.player, playerDrawn, playerHand, playerMelds.length],
  );

  const canOpponentRiichiAnkan = useCallback(
    (base: TileId): boolean => {
      if (!riichiState.opponent) return true;
      if (!opponentDrawn) return false;

      const b = tileBase(base);
      if (tileBase(opponentDrawn) !== b) return false;

      const handCounts = countTiles(opponentHand);
      if ((handCounts[b] ?? 0) !== 3) return false;

      const riichiWaits = riichiWaitsRef.current.opponent;
      if (!riichiWaits) return false;

      const nextHand = [...opponentHand];
      const removed = removeTilesByBase(nextHand, b, 3);
      if (removed.length !== 3) return false;
      const meldCountAfter = opponentMelds.length + 1;
      const waitsAfter = Array.from(getWinningTilesWithMeldCount(nextHand, meldCountAfter)).sort();

      if (waitsAfter.length !== riichiWaits.length) return false;
      for (let i = 0; i < waitsAfter.length; i++) {
        if (waitsAfter[i] !== riichiWaits[i]) return false;
      }
      return true;
    },
    [riichiState.opponent, opponentDrawn, opponentHand, opponentMelds.length],
  );

  const kanCandidates = useMemo<KanCandidate[]>(() => {
    if (gameState !== 'player_turn') return [];

    const concealedTiles = playerDrawn ? [...playerHand, playerDrawn] : [...playerHand];
    const concealedCounts = countTiles(concealedTiles);

    const ankan: KanCandidate[] = Object.entries(concealedCounts)
      .filter(([, ct]) => ct >= 4)
      .map(([base]) => ({ kind: 'ankan' as const, base }));

    const kakan: KanCandidate[] = playerMelds
      .map((m) => (m.type === 'pon' ? tileBase(m.tiles[0]!) : null))
      .filter((base): base is TileId => !!base && (concealedCounts[base] || 0) >= 1)
      .map((base) => ({ kind: 'kakan' as const, base }));

    const orderSuit = (b: string) => (b[0] === 'm' ? 0 : b[0] === 'p' ? 1 : b[0] === 's' ? 2 : 3);
    const orderNum = (b: string) => parseInt(b.slice(1), 10) || 0;
    const sortByBase = (a: TileId, b: TileId) => {
      const sa = orderSuit(a);
      const sb = orderSuit(b);
      if (sa !== sb) return sa - sb;
      return orderNum(a) - orderNum(b);
    };

    const sorted = [
      ...ankan.sort((a, b) => sortByBase(a.base, b.base)),
      ...kakan.sort((a, b) => sortByBase(a.base, b.base)),
    ];

    // リーチ後は暗槓のみ（加槓不可）。さらに待ちが変わらないケースだけ許可。
    if (riichiState.player) {
      return sorted.filter((c) => c.kind === 'ankan' && canPlayerRiichiAnkan(c.base));
    }

    return sorted;
  }, [gameState, playerHand, playerDrawn, playerMelds, riichiState.player, canPlayerRiichiAnkan]);

  const declareKan = useCallback(
    (base: TileId): boolean => {
      if (gameState !== 'player_turn') return false;
      // Prevent double-trigger (e.g., double-click) which can reveal dora twice.
      if (kanActionLockRef.current) return false;
      kanActionLockRef.current = true;
      const releaseLock = () => {
        kanActionLockRef.current = false;
      };

      const candidate = kanCandidates.find((c) => c.base === base);
      if (!candidate) {
        releaseLock();
        return false;
      }

      if (riichiState.player) {
        // リーチ後は暗槓のみ許可
        if (candidate.kind !== 'ankan' || !canPlayerRiichiAnkan(base)) {
          releaseLock();
          return false;
        }
      }

      noteCallMade();

      const originalDrawn = playerDrawn;

      if (candidate.kind === 'kakan') {
        const idx = findPonMeldIndexByBase(playerMelds, base);
        if (idx === -1) {
          releaseLock();
          return false;
        }

        const nextHand = [...playerHand];
        let addedTile: TileId | null = null;
        let consumedDrawn = false;

        if (originalDrawn && tileBase(originalDrawn) === base) {
          addedTile = originalDrawn;
          consumedDrawn = true;
        } else {
          addedTile = removeOneTileByBase(nextHand, base);
        }
        if (!addedTile) {
          releaseLock();
          return false;
        }

        if (originalDrawn && !consumedDrawn) nextHand.push(originalDrawn);

        setPlayerHand(nextHand.sort(sortHand));
        setPlayerDrawn(null);
        setPlayerMelds((melds) => {
          const next = [...melds];
          const current = next[idx];
          if (!current || current.type !== 'pon') return melds;
          next[idx] = { type: 'kan', tiles: [...current.tiles, addedTile!], concealed: false };
          return next;
        });
      } else {
        const nextHand = [...playerHand];
        const taken: TileId[] = [];
        let consumedDrawn = false;

        taken.push(...removeTilesByBase(nextHand, base, 4));
        if (taken.length < 4 && originalDrawn && tileBase(originalDrawn) === base) {
          taken.push(originalDrawn);
          consumedDrawn = true;
        }
        if (taken.length !== 4) {
          releaseLock();
          return false;
        }

        if (originalDrawn && !consumedDrawn) nextHand.push(originalDrawn);

        setPlayerHand(nextHand.sort(sortHand));
        setPlayerDrawn(null);
        setPlayerMelds((m) => [...m, { type: 'kan', tiles: taken, concealed: true }]);
      }

      revealDoraIndicator();
      drawRinshanTileFor('player'); // 嶺上
      setSkipDraw(false);
      setCurrentTurn('player');
      setGameState('player_turn');
      // Unlock after a short delay to avoid multiple UI clicks in the same moment.
      setTimeout(releaseLock, 250);
      return true;
    },
    [gameState, kanCandidates, noteCallMade, playerMelds, playerHand, playerDrawn, revealDoraIndicator, drawRinshanTileFor, riichiState.player, canPlayerRiichiAnkan],
  );

  const promptCallForPlayer = useCallback(
    (tile: TileId) => {
      if (!tile) return false;
      const base = tileBase(tile);
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
	      const chiOptions = getChiOptions(playerHand, base);
	      const pon = canPon(playerHand, base);
	      const kan = canKanFromDiscard(playerHand, base);
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

	      noteCallMade();
	      // 鳴かれた牌は河に残し、`calledRiverIndices` で薄く表示する
      setKuikaeForbiddenBase((k) => ({ ...k, player: tileBase(tile) }));
	
	      const nextHand = [...playerHand];
	      let meldToAdd: Meld | null = null;
	      const base = tileBase(tile);
	
	      if (type === 'pon') {
	        const removed = removeTilesByBase(nextHand, base, 2);
	        if (removed.length === 2) meldToAdd = { type: 'pon', tiles: [tile, ...removed] };
	      } else if (type === 'kan') {
	        const removed = removeTilesByBase(nextHand, base, 3);
	        if (removed.length === 3) meldToAdd = { type: 'kan', tiles: [tile, ...removed], concealed: false };
	      } else if (type === 'chi' && option) {
	        const meldTiles: TileId[] = [];
	        for (const t of option) {
	          if (t === base) {
	            meldTiles.push(tile);
	            continue;
	          }
	          const taken = removeOneTileByBase(nextHand, t);
	          if (!taken) return;
	          meldTiles.push(taken);
	        }
	        meldToAdd = { type: 'chi', tiles: meldTiles };
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
        drawRinshanTileFor('player'); // 嶺上
        setSkipDraw(false);
      }
	    },
	    [callPrompt, handleWin, noteCallMade, drawRinshanTileFor, revealDoraIndicator, playerHand, opponentRiver, markCalledDiscard],
	  );

  const discardTile = useCallback(
    (tileIndex: number, fromDrawn: boolean) => {
      if (gameState !== 'player_turn') return;
      if (playerDrawn === null && !skipDraw) return;
      // リーチ中はツモ牌以外を切れない（ツモ切りのみ）
      if (riichiState.player && !fromDrawn) return;
      const wasAlreadyRiichi = riichiState.player;
      setWinPrompt(null);
      setDeclinedWinKey(null);

      let discard: TileId | null = null;
      let nextDrawn: TileId | null = playerDrawn;
      const newHand = [...playerHand];

      if (fromDrawn) {
        discard = playerDrawn;
        nextDrawn = null;
      } else {
        discard = newHand.splice(tileIndex, 1)[0] ?? null;
        if (playerDrawn) {
          newHand.push(playerDrawn);
          newHand.sort(sortHand);
          nextDrawn = null;
        }
      }
      if (!discard) return;

      // リーチ準備中は「切ってもテンパイが維持できる牌」以外切れない
      if (riichiIntent.player && !riichiState.player && !isTenpaiWithMeldCount(newHand, playerMelds.length)) return;

      // 鳴き直後の食い替え簡易ルール：鳴いた牌と同種は直後に切れない
      if (kuikaeForbiddenBase.player && tileBase(discard) === kuikaeForbiddenBase.player) return;

      setPlayerDrawn(nextDrawn);
      setPlayerHand(newHand);
      rinshanEligibleRef.current = { ...rinshanEligibleRef.current, player: false };
      const discardIndex = playerRiver.length;
      setPlayerRiver((r) => [...r, makeRiverEntry(discard!)]);
      if (riichiIntent.player && !riichiState.player) {
        // リーチ宣言準備中でも、切った後にテンパイを崩した場合はリーチしない（準備は解除）
        if (isTenpaiWithMeldCount(newHand, playerMelds.length)) {
          declareRiichi('player', discardIndex, newHand);
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
      const discardBase = tileBase(discard);
      const call = shouldOpponentCall(discard);

      if (call) {
        if (call.type === 'kan') {
          noteCallMade();
          const tile = discard;
          const newHand = [...opponentHand];
          const removed = removeTilesByBase(newHand, discardBase, 3);
          if (removed.length !== 3) return;
          setOpponentHand(newHand);
          setOpponentMelds((m) => [...m, { type: 'kan', tiles: [tile, ...removed], concealed: false }]);
          markCalledDiscard('player', discardIndex);
          setKuikaeForbiddenBase((k) => ({ ...k, opponent: discardBase }));
          revealDoraIndicator();
          drawRinshanTileFor('opponent');
          setSkipDraw(true);
          setCurrentTurn('opponent');
          setGameState('opponent_turn');
          return;
        }
        if (call.type === 'pon') {
          noteCallMade();
          const tile = discard;
          const newHand = [...opponentHand];
          const removed = removeTilesByBase(newHand, discardBase, 2);
          if (removed.length !== 2) return;
          setOpponentHand(newHand);
          setOpponentMelds((m) => [...m, { type: 'pon', tiles: [tile, ...removed] }]);
          markCalledDiscard('player', discardIndex);
          setKuikaeForbiddenBase((k) => ({ ...k, opponent: discardBase }));
          setSkipDraw(true);
          setCurrentTurn('opponent');
          setGameState('opponent_turn');
          return;
        }
        if (call.type === 'chi') {
          noteCallMade();
          const option = call.option ?? getChiOptions(opponentHand, discardBase)[0];
          const newHand = [...opponentHand];
          const meldTiles: TileId[] = [];
          for (const t of option) {
            if (t === discardBase) {
              meldTiles.push(discard);
              continue;
            }
            const taken = removeOneTileByBase(newHand, t);
            if (!taken) return;
            meldTiles.push(taken);
          }
          setOpponentHand(newHand);
          setOpponentMelds((m) => [...m, { type: 'chi', tiles: meldTiles }]);
          markCalledDiscard('player', discardIndex);
          setKuikaeForbiddenBase((k) => ({ ...k, opponent: discardBase }));
          setSkipDraw(true);
          setCurrentTurn('opponent');
          setGameState('opponent_turn');
          return;
        }
      }

      if (wasAlreadyRiichi) {
        setIppatsuEligible((i) => ({ ...i, player: false }));
      }
      if (kuikaeForbiddenBase.player) {
        setKuikaeForbiddenBase((k) => ({ ...k, player: null }));
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
      noteCallMade,
      kuikaeForbiddenBase.player,
      makeRiverEntry,
      playerMelds.length,
      opponentHand,
      canRonOnDiscard,
      handleWin,
      checkRyukyoku,
      drawRinshanTileFor,
      revealDoraIndicator,
      declareRiichi,
      markCalledDiscard,
      shouldOpponentCall,
    ],
  );

  const opponentDiscard = useCallback(
    (drawnTile?: TileId | null, intentToDeclareRiichi?: boolean): TileId | null => {
      const tile = drawnTile ?? opponentDrawn;
      // リーチ中はツモ牌をツモ切りする
      if (riichiState.opponent && tile) {
        setIppatsuEligible((i) => ({ ...i, opponent: false }));
        rinshanEligibleRef.current = { ...rinshanEligibleRef.current, opponent: false };
        setOpponentDrawn(null);
        setOpponentRiver((r) => [...r, makeRiverEntry(tile)]);
        return tile;
      }
      const fullHand = tile ? [...opponentHand, tile] : [...opponentHand];
      if (!fullHand.length) return null;
      const forbidBase = kuikaeForbiddenBase.opponent;
      const meldCount = opponentMelds.length;
      const remainingCounts = countTiles(wallRef.current);
      const reachThreat = riichiState.player;

      const fullHandBases = fullHand.map(tileBase);
      const countsFull = counts34FromBases(fullHandBases);
      const shantenCurrent = calculateShantenFromCounts(countsFull, meldCount);
      const doraCount = countDoraTiles(fullHand, doraTiles);
      const pushMode = !reachThreat || shantenCurrent === 0 || doraCount >= 3;
      const foldMode = reachThreat && !pushMode && shantenCurrent >= 2 && doraCount <= 1;

      const candidatesByBase = new Map<string, number[]>();
      for (let i = 0; i < fullHand.length; i++) {
        const base = fullHandBases[i]!;
        const list = candidatesByBase.get(base) ?? [];
        list.push(i);
        candidatesByBase.set(base, list);
      }

      const isForbiddenBase = (base: string) => !!forbidBase && base === forbidBase;

      const chooseIndexForBase = (indices: number[]) => {
        const nonRed = indices.find((i) => !isRedTile(fullHand[i]!));
        return nonRed ?? indices[0]!;
      };

      const playerRiverBases = new Set(playerRiver.map((r) => r.base));
      const honorDiscardCounts = new Map<string, number>();
      for (const r of [...playerRiver, ...opponentRiver]) {
        if (!isHonorBase(r.base)) continue;
        honorDiscardCounts.set(r.base, (honorDiscardCounts.get(r.base) ?? 0) + 1);
      }
      const sujiSafe = new Set<string>();
      for (const r of playerRiver) {
        const b = r.base;
        if (isHonorBase(b)) continue;
        const num = parseInt(b.slice(1), 10);
        const suit = b[0];
        const low = num - 3;
        const high = num + 3;
        if (low >= 1) sujiSafe.add(`${suit}${low}`);
        if (high <= 9) sujiSafe.add(`${suit}${high}`);
      }

      const safetyCategory = (base: string) => {
        if (playerRiverBases.has(base)) return 1; // 現物
        if (isHonorBase(base) && (honorDiscardCounts.get(base) ?? 0) > 0) return 2; // オタ風/オタ場の字牌
        if (sujiSafe.has(base)) return 3; // スジ
        if (isTerminalBase(base) || isHonorBase(base)) return 4; // 端・字牌
        return 5;
      };

      type EvalResult = {
        base: string;
        discardIndex: number;
        shanten: number;
        ukeire: number;
      };

      const evaluateBaseDiscard = (base: string, indices: number[]): EvalResult | null => {
        if (isForbiddenBase(base)) return null;
        const baseIdx = tileBaseToIndex(base);
        if (baseIdx === null) return null;
        if ((countsFull[baseIdx] ?? 0) <= 0) return null;

        const discardIndex = chooseIndexForBase(indices);
        const afterBases = [...fullHandBases];
        const removeAt = afterBases.findIndex((b) => b === base);
        if (removeAt === -1) return null;
        afterBases.splice(removeAt, 1);

        const countsAfter = countsFull.slice();
        countsAfter[baseIdx]!--;
        const shanten = calculateShantenFromCounts(countsAfter, meldCount);

        let ukeire = 0;
        for (const drawBase of allTileBases) {
          const remaining = remainingCounts[drawBase] ?? 0;
          if (remaining <= 0) continue;

          if (shanten === 0) {
            if (isWinningHand([...afterBases, drawBase])) ukeire += remaining;
            continue;
          }

          const drawIdx = tileBaseToIndex(drawBase);
          if (drawIdx === null) continue;

          const counts14 = countsAfter.slice();
          counts14[drawIdx] = (counts14[drawIdx] ?? 0) + 1;

          let bestAfterDraw = Number.POSITIVE_INFINITY;
          for (let i = 0; i < 34; i++) {
            if ((counts14[i] ?? 0) <= 0) continue;
            counts14[i]!--;
            const s = calculateShantenFromCounts(counts14, meldCount);
            if (s < bestAfterDraw) bestAfterDraw = s;
            counts14[i]!++;
            if (bestAfterDraw < shanten) break;
          }

          if (bestAfterDraw < shanten) ukeire += remaining;
        }

        return { base, discardIndex, shanten, ukeire };
      };

      const evals: EvalResult[] = [];
      for (const [base, indices] of candidatesByBase) {
        const e = evaluateBaseDiscard(base, indices);
        if (e) evals.push(e);
      }

      if (!evals.length) return null;

      type ScoredEval = EvalResult & { safety: number; isDora: boolean; isRed: boolean };
      const scored: ScoredEval[] = evals.map((e) => {
        const tileAtIndex = fullHand[e.discardIndex]!;
        const base = tileBase(tileAtIndex);
        return {
          ...e,
          safety: safetyCategory(base),
          isDora: doraTiles.includes(base) || isRedTile(tileAtIndex),
          isRed: isRedTile(tileAtIndex),
        };
      });

      if (!scored.length) return null;

      if (foldMode) {
        scored.sort((a, b) => {
          if (a.safety !== b.safety) return a.safety - b.safety;
          if (a.isDora !== b.isDora) return a.isDora ? 1 : -1;
          if (a.shanten !== b.shanten) return a.shanten - b.shanten;
          if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
          if (a.isRed !== b.isRed) return a.isRed ? 1 : -1;
          return a.base.localeCompare(b.base);
        });
      } else {
        scored.sort((a, b) => {
          if (a.shanten !== b.shanten) return a.shanten - b.shanten;
          if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
          if (a.isDora !== b.isDora) return a.isDora ? 1 : -1;
          if (a.isRed !== b.isRed) return a.isRed ? 1 : -1;
          return a.base.localeCompare(b.base);
        });
      }

      const best = scored[0]!;
      const discardIndex = best.discardIndex;

      const discard = fullHand.splice(discardIndex, 1)[0];
      rinshanEligibleRef.current = { ...rinshanEligibleRef.current, opponent: false };
      setOpponentHand(fullHand.sort(sortHand));
      setOpponentDrawn(null);
      const riverIndex = opponentRiver.length;
      setOpponentRiver((r) => [...r, makeRiverEntry(discard)]);
      if (kuikaeForbiddenBase.opponent) setKuikaeForbiddenBase((k) => ({ ...k, opponent: null }));

      // テンパイになったら即リーチ（門前＆供託支払い可能＆局が残っている場合）
      if (!riichiState.opponent && opponentMelds.length === 0 && remainingJun > 0 && (scores.opponent ?? 0) >= RIICHI_COST) {
        const afterBases = fullHand.map(tileBase);
        const afterCounts = counts34FromBases(afterBases);
        const shantenAfter = calculateShantenFromCounts(afterCounts, 0);
        if (shantenAfter === 0) {
          declareRiichi('opponent', riverIndex, fullHand);
        } else if (intentToDeclareRiichi || riichiIntent.opponent) {
          setRiichiIntent((i) => ({ ...i, opponent: false }));
        }
      } else if (intentToDeclareRiichi || riichiIntent.opponent) {
        setRiichiIntent((i) => ({ ...i, opponent: false }));
      }
      return discard;
    },
    [
      opponentDrawn,
      opponentHand,
      opponentRiver,
      playerRiver,
      riichiIntent.opponent,
      riichiState.opponent,
      riichiState.player,
      declareRiichi,
      kuikaeForbiddenBase.opponent,
      makeRiverEntry,
      opponentMelds.length,
      remainingJun,
      scores.opponent,
      doraTiles,
    ],
  );

  const opponentTurn = useCallback(() => {
    if (callPrompt) return;
    if (gameState !== 'opponent_turn') return;

    let drawnTile: TileId | null = opponentDrawn;
    let declaredIntent = false;

    // ツモチェック
    if (!skipDraw) {
      if (!drawnTile) {
        drawnTile = drawNormalTileFor('opponent');
      }
      if (!drawnTile) return;
      if (canWinWithYaku('opponent', 'tsumo', drawnTile)) {
        handleWin('opponent', 'tsumo', drawnTile);
        return;
      }

      // リーチ後の暗槓（AI）
      if (riichiState.opponent) {
        const base = tileBase(drawnTile);
        const counts = countTiles(opponentHand);
        if ((counts[base] ?? 0) === 3 && canOpponentRiichiAnkan(base)) {
          // 暗槓実行
          noteCallMade();
          const nextHand = [...opponentHand];
          const removed = removeTilesByBase(nextHand, base, 3);
          if (removed.length === 3) {
            const kanTile = drawnTile;
            setOpponentHand(nextHand.sort(sortHand));
            setOpponentDrawn(null);
            setOpponentMelds((m) => [...m, { type: 'kan', tiles: [kanTile, ...removed], concealed: true }]);
            revealDoraIndicator();
            drawnTile = drawRinshanTileFor('opponent');
            if (!drawnTile) return;
            if (canWinWithYaku('opponent', 'tsumo', drawnTile)) {
              handleWin('opponent', 'tsumo', drawnTile);
              return;
            }
          }
        }
      }
      const reachThreat = riichiState.player;
      const fullHandForMode = drawnTile ? [...opponentHand, drawnTile] : [...opponentHand];
      const shantenForMode = calculateShantenFromCounts(counts34FromBases(fullHandForMode.map(tileBase)), opponentMelds.length);
      const doraCountForMode = countDoraTiles(fullHandForMode, doraTiles);
      const shouldFoldAgainstRiichi = reachThreat && shantenForMode >= 2 && doraCountForMode <= 1;
      // リーチ判定
      if (!opponentMelds.length && !riichiState.opponent && !shouldFoldAgainstRiichi) {
        const remaining = Math.max(0, MAX_JUN * 2 - drawCount);
        if (
          remaining > 0 &&
          (scores.opponent ?? 0) >= RIICHI_COST &&
          canDeclareRiichiFromHand(opponentHand, drawnTile, opponentMelds, false)
        ) {
          declaredIntent = true;
        }
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
    drawNormalTileFor('player');
  }, [
    gameState,
    skipDraw,
    drawNormalTileFor,
    opponentHand,
    opponentMelds,
    handleWin,
    riichiState.opponent,
    scores.opponent,
    drawCount,
    opponentDiscard,
    canRonOnDiscard,
    promptCallForPlayer,
    checkRyukyoku,
    callPrompt,
    opponentDrawn,
    canWinWithYaku,
    canOpponentRiichiAnkan,
    noteCallMade,
    revealDoraIndicator,
    drawRinshanTileFor,
    doraTiles,
  ]);

  useEffect(() => {
    if (gameState !== 'opponent_turn' || callPrompt) return;
    const timer = setTimeout(() => opponentTurn(), 600);
    return () => clearTimeout(timer);
  }, [gameState, callPrompt, opponentTurn]);

  useEffect(() => {
    if (gameState === 'player_turn' && !playerDrawn && !skipDraw) {
      // 自動ツモ処理（巡目に入った直後に1枚引く）
      drawNormalTileFor('player');
    }
  }, [gameState, playerDrawn, skipDraw, drawNormalTileFor]);

  useEffect(() => {
    if (gameState !== 'player_turn') return;
    if (!playerDrawn) return;
    if (!canWinWithYaku('player', 'tsumo', playerDrawn)) return;
    const key = `tsumo-${playerDrawn}-${drawCount}`;
    if (declinedWinKey === key) return;
    if (winPrompt?.key === key) return;
    setWinPrompt({ method: 'tsumo', tile: playerDrawn, key });
  }, [gameState, playerDrawn, playerHand, drawCount, declinedWinKey, winPrompt?.key, canWinWithYaku]);

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

    // アクション
    startGame,
    nextRound,
    discardTile,
    kanCandidates,
    declareKan,
    resolveCall,
    resolveWinPrompt,
    handleRiichi,
  };
};
