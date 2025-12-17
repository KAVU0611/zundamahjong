import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateScore, nextDoraTile, type ScoreResult, type WinMethod } from '../lib/mahjong/scoring';

export type TileId = string;
type TileType = 'man' | 'pin' | 'sou' | 'honor';
type TileSpec = { type: TileType; number: number; index: number; id: TileId; isRed: boolean };
type RiverEntry = { id: string; tileId: TileId; base: string; isRed: boolean };

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

const countRedFives = (deck: TileSpec[]) =>
  deck.filter((t) => (t.type === 'man' || t.type === 'pin' || t.type === 'sou') && t.number === 5 && t.index === 0).length;

const validateDeck = (deck: TileSpec[]): TileSpec[] => {
  // Repair duplicates/missing indices per (type, number) so that each group has exactly indexes 0..3 once.
  const byKey: Record<string, TileSpec[]> = {};
  for (const t of deck) {
    const key = `${t.type}-${t.number}`;
    byKey[key] = byKey[key] ?? [];
    byKey[key]!.push(t);
  }

  const fixed: TileSpec[] = [];
  let hadRedDup = false;

  for (const [key, group] of Object.entries(byKey)) {
    const [type, numStr] = key.split('-') as [TileType, string];
    const number = parseInt(numStr, 10);
    const used = new Set<number>();
    const extras: TileSpec[] = [];
    const kept: TileSpec[] = [];

    for (const t of group) {
      if (!used.has(t.index)) {
        used.add(t.index);
        kept.push(t);
      } else {
        extras.push(t);
      }
    }

    const missing: number[] = [];
    for (let i = 0; i < 4; i++) if (!used.has(i)) missing.push(i);

    // Reassign extras into missing slots by rewriting their id/index/isRed.
    for (const t of extras) {
      const m = missing.shift();
      if (m === undefined) break;
      if ((type === 'man' || type === 'pin' || type === 'sou') && number === 5 && t.index === 0) hadRedDup = true;
      t.index = m;
      t.id = `${type}-${number}-${m}`;
      t.isRed = (type === 'man' || type === 'pin' || type === 'sou') && number === 5 && m === 0;
      kept.push(t);
    }

    // If still missing, create new tiles.
    for (const m of missing) {
      kept.push({
        type,
        number,
        index: m,
        id: `${type}-${number}-${m}`,
        isRed: (type === 'man' || type === 'pin' || type === 'sou') && number === 5 && m === 0,
      });
    }

    // Normalize isRed to match rule (index 0 only).
    for (const t of kept) {
      t.isRed = (type === 'man' || type === 'pin' || type === 'sou') && number === 5 && t.index === 0;
    }

    fixed.push(...kept.slice(0, 4));
  }

  if (hadRedDup) {
    // eslint-disable-next-line no-console
    console.error('Duplicate Red 5 detected!');
  }

  // Ensure we have exactly 34 * 4 tiles and unique IDs.
  const unique = new Map<string, TileSpec>();
  for (const t of fixed) unique.set(t.id, t);
  const result = Array.from(unique.values());

  // eslint-disable-next-line no-console
  console.log('Deck created. Red 5s count:', countRedFives(result));

  return result;
};

const initializeDeck = (): TileSpec[] => {
  const deck: TileSpec[] = [];
  const defs: { type: TileType; max: number }[] = [
    { type: 'man', max: 9 },
    { type: 'pin', max: 9 },
    { type: 'sou', max: 9 },
    { type: 'honor', max: 7 },
  ];
  for (const def of defs) {
    for (let number = 1; number <= def.max; number++) {
      for (let index = 0; index < 4; index++) {
        const isRed = (def.type === 'man' || def.type === 'pin' || def.type === 'sou') && number === 5 && index === 0;
        deck.push({ type: def.type, number, index, id: `${def.type}-${number}-${index}`, isRed });
      }
    }
  }
  return validateDeck(deck);
};

const createInitialWall = (): TileId[] => {
  const deck = initializeDeck();
  const wall = deck.map((t) => t.id);
  if (wall.length !== 136) throw new Error(`invalid wall length: expected 136, got ${wall.length}`);

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

const isTenpai = (hand: TileId[]) => allTileIds.some((tile) => isWinningHand([...hand, tile]));

const isTenpaiWithDrawn = (hand: TileId[], drawn: TileId | null) => {
  const fullHand = drawn ? [...hand, drawn] : [...hand];

  // 1枚待ち判定（13枚相当: 13,10,7...）
  if (fullHand.length % 3 === 1) return isTenpai(fullHand);

  // ツモって14枚相当なら、どれか1枚切ってテンパイに残れるかで判定
  if (fullHand.length % 3 === 2) {
    return fullHand.some((_, index) => {
      const afterDiscard = fullHand.filter((__, j) => j !== index);
      return isTenpai(afterDiscard);
    });
  }

  return false;
};

const canDeclareRiichiFromHand = (baseHand: TileId[], drawn: TileId | null, melds: Meld[], alreadyRiichi: boolean) => {
  if (alreadyRiichi) return false;
  if (melds.length > 0) return false; // 門前のみ
  const fullHand = drawn ? [...baseHand, drawn] : [...baseHand];

  // 13枚相当(≡1 mod 3)ならそのままテンパイ判定、
  // 14枚相当(≡2 mod 3)なら「どれか1枚切ってテンパイになれるか」を判定
  if (fullHand.length % 3 === 1) return isTenpai(fullHand);
  if (fullHand.length % 3 === 2) return isTenpaiWithDrawn(baseHand, drawn);
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

const countPairsInHand = (hand: TileId[]) => {
  const counts = countTiles(hand);
  return Object.values(counts).filter((ct) => ct >= 2).length;
};

const getWinningTiles = (hand: TileId[]) => {
  const waits = new Set<TileId>();
  for (const tile of allTileIds) {
    if (isWinningHand([...hand, tile])) waits.add(tile);
  }
  return Array.from(waits);
};

const isFuriten = (hand: TileId[], river: RiverEntry[]) => {
  if (!river.length) return false;
  const riverBases = new Set(river.map((r) => r.base));
  const waits = getWinningTiles(hand);
  return waits.some((tile) => riverBases.has(tile));
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
    setDoubleRiichiState({ player: false, opponent: false });
    setIppatsuEligible({ player: false, opponent: false });
    setAnyCallMade(false);
    setKuikaeForbiddenBase({ player: null, opponent: null });
    setRiichiIntent({ player: false, opponent: false });
    setRiichiDeclarationIndex({ player: null, opponent: null });
    setCalledRiverIndices({ player: [], opponent: [] });
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
    };
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
      const isDoubleRiichi = riverIndex === 0 && !anyCallMade;
      setDoubleRiichiState((d) => ({ ...d, [who]: isDoubleRiichi }));
      setIppatsuEligible((i) => ({ ...i, [who]: true }));
      setRiichiIntent((i) => ({ ...i, [who]: false }));
      setRiichiDeclarationIndex((idx) => ({ ...idx, [who]: riverIndex }));
      setScores((s) => ({ ...s, [who]: s[who] - 1000 }));
      setKyotaku((k) => k + 1);
      handleReaction('reach');
    },
    [handleReaction, anyCallMade],
  );

  const cancelIppatsu = useCallback(() => {
    setIppatsuEligible({ player: false, opponent: false });
  }, []);

  const noteCallMade = useCallback(() => {
    setAnyCallMade(true);
    cancelIppatsu();
  }, [cancelIppatsu]);

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
  }, [roundIndex, startRound, roundResult]);

  const checkRyukyoku = useCallback(() => {
    if (!wall.length || drawCount >= MAX_JUN * 2) {
      const dealer = round.dealer;
      const dealerHand = dealer === 'player' ? playerHand : opponentHand;
      const dealerDrawn = dealer === 'player' ? playerDrawn : opponentDrawn;
      const dealerTenpai = isTenpaiWithDrawn(dealerHand, dealerDrawn);
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
    wall.length,
    drawCount,
    endRound,
    honba,
    kyotaku,
    round.dealer,
    playerHand,
    opponentHand,
    playerDrawn,
    opponentDrawn,
  ]);

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
      const isDoubleRiichi = doubleRiichiState[winner];
      const isIppatsu = ippatsuEligible[winner];
      const remaining = Math.max(0, MAX_JUN * 2 - drawCount);
      const isHaitei = reason === 'tsumo' && remaining === 0;
      const isHoutei = reason === 'ron' && remaining === 0;
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

  const shouldOpponentCall = useCallback(
    (discard: TileId) => {
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
    [opponentHand, opponentMelds, round.dealer, round.label],
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

    return [...ankan.sort((a, b) => sortByBase(a.base, b.base)), ...kakan.sort((a, b) => sortByBase(a.base, b.base))];
  }, [gameState, playerHand, playerDrawn, playerMelds]);

  const declareKan = useCallback(
    (base: TileId): boolean => {
      if (gameState !== 'player_turn') return false;

      const candidate = kanCandidates.find((c) => c.base === base);
      if (!candidate) return false;

      noteCallMade();

      const originalDrawn = playerDrawn;

      if (candidate.kind === 'kakan') {
        const idx = findPonMeldIndexByBase(playerMelds, base);
        if (idx === -1) return false;

        const nextHand = [...playerHand];
        let addedTile: TileId | null = null;
        let consumedDrawn = false;

        if (originalDrawn && tileBase(originalDrawn) === base) {
          addedTile = originalDrawn;
          consumedDrawn = true;
        } else {
          addedTile = removeOneTileByBase(nextHand, base);
        }
        if (!addedTile) return false;

        if (originalDrawn && !consumedDrawn) nextHand.push(originalDrawn);

        setPlayerHand(nextHand.sort(sortHand));
        setPlayerDrawn(null);
        setPlayerMelds((melds) => {
          const next = [...melds];
          const current = next[idx];
          if (!current || current.type !== 'pon') return melds;
          next[idx] = { type: 'kan', tiles: [...current.tiles, addedTile!] };
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
        if (taken.length !== 4) return false;

        if (originalDrawn && !consumedDrawn) nextHand.push(originalDrawn);

        setPlayerHand(nextHand.sort(sortHand));
        setPlayerDrawn(null);
        setPlayerMelds((m) => [...m, { type: 'kan', tiles: taken }]);
      }

      revealDoraIndicator();
      drawTileFor('player'); // 嶺上
      setSkipDraw(false);
      setCurrentTurn('player');
      setGameState('player_turn');
      return true;
    },
    [gameState, kanCandidates, noteCallMade, playerMelds, playerHand, playerDrawn, revealDoraIndicator, drawTileFor],
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
	        if (removed.length === 3) meldToAdd = { type: 'kan', tiles: [tile, ...removed] };
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
        drawTileFor('player'); // 嶺上
        setSkipDraw(false);
      }
	    },
	    [callPrompt, handleWin, noteCallMade, drawTileFor, revealDoraIndicator, playerHand, opponentRiver, markCalledDiscard],
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
      if (riichiIntent.player && !riichiState.player && !isTenpai(newHand)) return;

      // 鳴き直後の食い替え簡易ルール：鳴いた牌と同種は直後に切れない
      if (kuikaeForbiddenBase.player && tileBase(discard) === kuikaeForbiddenBase.player) return;

      setPlayerDrawn(nextDrawn);
      setPlayerHand(newHand);
      const discardIndex = playerRiver.length;
      setPlayerRiver((r) => [...r, makeRiverEntry(discard!)]);
      if (riichiIntent.player && !riichiState.player) {
        // リーチ宣言準備中でも、切った後にテンパイを崩した場合はリーチしない（準備は解除）
        if (isTenpai(newHand)) {
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
          setOpponentMelds((m) => [...m, { type: 'kan', tiles: [tile, ...removed] }]);
          markCalledDiscard('player', discardIndex);
          setKuikaeForbiddenBase((k) => ({ ...k, opponent: discardBase }));
          revealDoraIndicator();
          drawTileFor('opponent');
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
      opponentHand,
      canRonOnDiscard,
      handleWin,
      checkRyukyoku,
      drawTileFor,
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
        setOpponentDrawn(null);
        setOpponentRiver((r) => [...r, makeRiverEntry(tile)]);
        return tile;
      }
      const fullHand = tile ? [...opponentHand, tile] : [...opponentHand];
      if (!fullHand.length) return null;
      const pickRiichiDiscard = () => {
        const candidates: number[] = [];
        for (let i = 0; i < fullHand.length; i++) {
          const after = fullHand.filter((_, j) => j !== i);
          if (isTenpai(after)) candidates.push(i);
        }
        // Prefer discarding non-red tiles when possible
        const nonRed = candidates.filter((i) => !isRedTile(fullHand[i]!));
        if (nonRed.length) return nonRed[0]!;
        if (candidates.length) return candidates[0]!;
        return null;
      };
      const forbidBase = kuikaeForbiddenBase.opponent;
      const canDiscardIndex = (i: number) => !forbidBase || tileBase(fullHand[i]!) !== forbidBase;

      let discardIndex: number | null = null;
      if (intentToDeclareRiichi || riichiIntent.opponent) {
        const idx = pickRiichiDiscard();
        if (idx !== null && canDiscardIndex(idx)) discardIndex = idx;
      }
      if (discardIndex === null) {
        const candidates = fullHand.map((_, i) => i).filter(canDiscardIndex);
        const nonRedCandidates = candidates.filter((i) => !isRedTile(fullHand[i]!));
        const pool = nonRedCandidates.length ? nonRedCandidates : candidates;
        discardIndex = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : Math.floor(Math.random() * fullHand.length);
      }

      const discard = fullHand.splice(discardIndex, 1)[0];
      setOpponentHand(fullHand.sort(sortHand));
      setOpponentDrawn(null);
      const riverIndex = opponentRiver.length;
      setOpponentRiver((r) => [...r, makeRiverEntry(discard)]);
      if (kuikaeForbiddenBase.opponent) setKuikaeForbiddenBase((k) => ({ ...k, opponent: null }));
      if ((intentToDeclareRiichi || riichiIntent.opponent) && !riichiState.opponent) {
        if (isTenpai(fullHand)) {
          declareRiichi('opponent', riverIndex);
        } else {
          setRiichiIntent((i) => ({ ...i, opponent: false }));
        }
      }
      return discard;
    },
    [opponentDrawn, opponentHand, opponentRiver, riichiIntent.opponent, riichiState.opponent, declareRiichi, kuikaeForbiddenBase.opponent, makeRiverEntry],
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
      if (!opponentMelds.length && !riichiState.opponent) {
        const remaining = Math.max(0, MAX_JUN * 2 - drawCount);
        if (remaining > 0 && canDeclareRiichiFromHand(opponentHand, drawnTile, opponentMelds, false)) {
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
    drawTileFor('player');
  }, [
    gameState,
    skipDraw,
    drawTileFor,
    opponentHand,
    opponentMelds,
    handleWin,
    riichiState.opponent,
    drawCount,
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
    kanCandidates,
    declareKan,
    resolveCall,
    resolveWinPrompt,
    handleRiichi,
  };
};
