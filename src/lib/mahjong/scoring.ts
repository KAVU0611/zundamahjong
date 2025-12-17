import type { TileId } from '../../hooks/useMahjong';

export type Player = 'player' | 'opponent';

export type WinMethod = 'tsumo' | 'ron';

export type MeldType = 'pon' | 'chi' | 'kan';

export type Meld = {
  type: MeldType;
  tiles: TileId[];
};

export type Yaku = {
  name: string;
  han: number;
};

export type ScoreResult = {
  yaku: Yaku[];
  han: number;
  fu: number;
  limitName: string | null;
  basePoints: number;
  totalPoints: number;
  doraHan: number;
  akaDoraHan: number;
  uraDoraHan: number;
};

const countTiles = (tiles: TileId[]) => {
  const counts: Record<string, number> = {};
  for (const t of tiles) {
    const base = t.split('_')[0]!;
    counts[base] = (counts[base] || 0) + 1;
  }
  return counts;
};

const cloneCounts = (counts: Record<string, number>) => ({ ...counts });

const parseBaseAndRed = (t: TileId): { base: TileId; isRed: boolean } => {
  const dashParts = t.split('-');
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
  const base = t.split('_')[0]!;
  const isRed = t.includes('_dora_') || t.endsWith('_dora') || t.endsWith('_red');
  return { base, isRed };
};

const baseTile = (t: TileId) => parseBaseAndRed(t).base;
const isHonor = (t: TileId) => baseTile(t)[0] === 'z';
const tileNumber = (t: TileId) => parseInt(baseTile(t).slice(1), 10);
const isTerminal = (t: TileId) => !isHonor(t) && (tileNumber(t) === 1 || tileNumber(t) === 9);
const isTerminalOrHonor = (t: TileId) => isHonor(t) || isTerminal(t);
const isSimple = (t: TileId) => !isHonor(t) && tileNumber(t) >= 2 && tileNumber(t) <= 8;

const roundUpToHundreds = (points: number) => Math.ceil(points / 100) * 100;
const roundUpToTens = (fu: number) => Math.ceil(fu / 10) * 10;

export const nextDoraTile = (indicator: TileId): TileId => {
  const base = baseTile(indicator);
  const suit = base[0];
  const num = tileNumber(indicator);
  if (suit === 'm' || suit === 'p' || suit === 's') {
    const next = num === 9 ? 1 : num + 1;
    return `${suit}${next}`;
  }
  if (suit === 'z') {
    if (num >= 1 && num <= 4) return `z${num === 4 ? 1 : num + 1}`;
    if (num >= 5 && num <= 7) return `z${num === 7 ? 5 : num + 1}`;
  }
  return base;
};

const countDora = (tiles: TileId[], indicators: TileId[]) => {
  const doraTiles = indicators.map(nextDoraTile);
  const counts = countTiles(tiles);
  let total = 0;
  for (const dora of doraTiles) total += counts[dora] || 0;
  return total;
};

const countAkaDora = (tiles: TileId[]) =>
  tiles.filter((t) => {
    const parsed = parseBaseAndRed(t);
    return (parsed.base === 'm5' || parsed.base === 'p5' || parsed.base === 's5') && parsed.isRed;
  }).length;

type SetShape =
  | { kind: 'sequence'; tiles: [TileId, TileId, TileId]; open: boolean }
  | { kind: 'triplet'; tile: TileId; open: boolean }
  | { kind: 'quad'; tile: TileId; open: boolean };

type HandShape = {
  isSevenPairs: boolean;
  pairTile: TileId | null;
  sets: SetShape[];
  waitFu: number;
  isPinfuWait: boolean;
};

const removeOneTile = (tiles: TileId[], target: TileId): TileId[] => {
  const targetBase = baseTile(target);
  const out: TileId[] = [];
  let removed = false;
  for (const t of tiles) {
    if (!removed && baseTile(t) === targetBase) {
      removed = true;
      continue;
    }
    out.push(t);
  }
  return out;
};

const tilesFromSets = (sets: SetShape[]) => {
  const out: TileId[] = [];
  for (const s of sets) {
    if (s.kind === 'sequence') out.push(...s.tiles);
    if (s.kind === 'triplet') out.push(s.tile, s.tile, s.tile);
    if (s.kind === 'quad') out.push(s.tile, s.tile, s.tile, s.tile);
  }
  return out;
};

const suitsInTiles = (tiles: TileId[]) => {
  const suits = new Set<string>();
  for (const t of tiles) {
    const base = baseTile(t);
    if (base[0] === 'm' || base[0] === 'p' || base[0] === 's') suits.add(base[0]);
  }
  return suits;
};

const allTilesAreTanyao = (tiles: TileId[]) => tiles.every((t) => isSimple(t));

const isChiitoi = (tiles: TileId[]) => {
  if (tiles.length !== 14) return false;
  const counts = countTiles(tiles);
  return Object.values(counts).every((v) => v === 2);
};

const listAllTileIds = (): TileId[] => {
  const ids: TileId[] = [];
  for (const suit of ['m', 'p', 's']) {
    for (let i = 1; i <= 9; i++) ids.push(`${suit}${i}`);
  }
  for (let i = 1; i <= 7; i++) ids.push(`z${i}`);
  return ids;
};

const sortedTileIds = listAllTileIds();

const buildMeldShapes = (melds: Meld[]): SetShape[] => {
  const shapes: SetShape[] = [];
  for (const m of melds) {
    if (m.type === 'chi') {
      const tiles = m.tiles.map(baseTile).sort();
      if (tiles.length === 3) {
        shapes.push({ kind: 'sequence', tiles: [tiles[0]!, tiles[1]!, tiles[2]!], open: true });
      }
    } else if (m.type === 'pon') {
      shapes.push({ kind: 'triplet', tile: baseTile(m.tiles[0]!), open: true });
    } else if (m.type === 'kan') {
      shapes.push({ kind: 'quad', tile: baseTile(m.tiles[0]!), open: true });
    }
  }
  return shapes;
};

const listPossibleWinTiles = (opts: {
  preWinConcealedTiles: TileId[]; // 13 tiles (hand without winning tile)
  openSetCount: number;
}): Set<TileId> => {
  const normalizedPreWin = opts.preWinConcealedTiles.map(baseTile);
  const winTiles = new Set<TileId>();

  const requiredConcealedSetCount = 4 - opts.openSetCount;
  for (const candidate of sortedTileIds) {
    const concealed14 = [...normalizedPreWin, candidate];

    if (opts.openSetCount === 0 && isChiitoi(concealed14)) {
      winTiles.add(candidate);
      continue;
    }

    if (requiredConcealedSetCount >= 0) {
      const shapes = extractAllConcealedShapes(concealed14, requiredConcealedSetCount, candidate);
      if (shapes.length > 0) winTiles.add(candidate);
    }
  }

  return winTiles;
};

const extractAllConcealedShapes = (
  concealedTiles: TileId[],
  requiredSetCount: number,
  winTile: TileId,
): HandShape[] => {
  const shapes: HandShape[] = [];
  const normalizedConcealed = concealedTiles.map(baseTile);
  const normalizedWinTile = baseTile(winTile);

  if (requiredSetCount < 0) return shapes;
  if (normalizedConcealed.length !== requiredSetCount * 3 + 2) return shapes;

  if (requiredSetCount === 0) {
    const counts = countTiles(normalizedConcealed);
    const pairCandidates = Object.entries(counts).filter(([, v]) => v === 2);
    for (const [pairTile] of pairCandidates) {
      const waitFu = pairTile === normalizedWinTile ? 2 : 0;
      shapes.push({
        isSevenPairs: false,
        pairTile,
        sets: [],
        waitFu,
        isPinfuWait: waitFu === 0,
      });
    }
    return shapes;
  }

  const counts = countTiles(normalizedConcealed);
  for (const [pairTile, ct] of Object.entries(counts)) {
    if (ct < 2) continue;
    const restCounts = cloneCounts(counts);
    restCounts[pairTile] -= 2;

    const collectSets = (currentCounts: Record<string, number>, sets: SetShape[]) => {
      if (sets.length === requiredSetCount) {
        if (Object.values(currentCounts).every((v) => v === 0)) {
          // wait / pinfu-wait estimation (take best case inside this fixed shape)
          const waitFu = calcWaitFu({ pairTile, sets }, normalizedWinTile);
          const isPinfuWait = waitFu === 0;
          shapes.push({
            isSevenPairs: false,
            pairTile,
            sets,
            waitFu,
            isPinfuWait,
          });
        }
        return;
      }
      const nextTile = sortedTileIds.find((t) => (currentCounts[t] || 0) > 0);
      if (!nextTile) return;

      const nextCt = currentCounts[nextTile] || 0;
      // triplet
      if (nextCt >= 3) {
        const n = cloneCounts(currentCounts);
        n[nextTile] -= 3;
        collectSets(n, [...sets, { kind: 'triplet', tile: nextTile, open: false }]);
      }
      // sequence
      const suit = nextTile[0];
      const num = tileNumber(nextTile);
      if (suit !== 'z' && num <= 7) {
        const t1 = `${suit}${num + 1}`;
        const t2 = `${suit}${num + 2}`;
        if ((currentCounts[t1] || 0) > 0 && (currentCounts[t2] || 0) > 0) {
          const n = cloneCounts(currentCounts);
          n[nextTile]--;
          n[t1]--;
          n[t2]--;
          collectSets(n, [...sets, { kind: 'sequence', tiles: [nextTile, t1, t2], open: false }]);
        }
      }
    };

    collectSets(restCounts, []);
  }
  return shapes;
};

const calcWaitFu = (shape: { pairTile: TileId; sets: SetShape[] }, winTile: TileId): number => {
  // tanki wait
  if (shape.pairTile === winTile) return 2;

  // For simplified scoring, prefer the "best" assignment for the winning tile when ambiguous.
  // Pinfu needs ryanmen; if any ryanmen assignment exists, treat wait as 0符.
  let hasNonRyanmen = false;

  for (const s of shape.sets) {
    if (s.kind !== 'sequence') continue;
    if (!s.tiles.includes(winTile)) continue;

    const nums = s.tiles.map(tileNumber).sort((a, b) => a - b);
    const start = nums[0]!;
    const mid = nums[1]!;
    const winNum = tileNumber(winTile);

    if (winNum === mid) {
      hasNonRyanmen = true; // kanchan
      continue;
    }

    const isPenchan = (start === 1 && winNum === 3) || (start === 7 && winNum === 7);
    if (isPenchan) {
      hasNonRyanmen = true;
      continue;
    }

    // ryanmen
    return 0;
  }

  return hasNonRyanmen ? 2 : 0;
};

const calcFu = (opts: {
  isMenzen: boolean;
  method: WinMethod;
  isPinfu: boolean;
  roundWind: TileId;
  seatWind: TileId;
  shape: HandShape;
}): number => {
  if (opts.shape.isSevenPairs) return 25;

  let fu = 20;

  if (opts.method === 'ron' && opts.isMenzen) fu += 10;
  if (opts.method === 'tsumo' && !opts.isPinfu) fu += 2;

  // Pair fu (yakuhai pair): simplified as a flat +2符 when it is any value tile.
  if (opts.shape.pairTile) {
    const p = opts.shape.pairTile;
    const isValuePair =
      p === 'z5' || p === 'z6' || p === 'z7' || p === opts.roundWind || p === opts.seatWind;
    if (isValuePair) fu += 2;
  }

  // Wait fu
  fu += opts.shape.waitFu;

  // Set fu
  for (const s of opts.shape.sets) {
    if (s.kind === 'sequence') continue;
    const tile = s.tile;
    const yao = isTerminalOrHonor(tile);
    if (s.kind === 'triplet') {
      if (s.open) fu += yao ? 4 : 2;
      else fu += yao ? 8 : 4;
    } else if (s.kind === 'quad') {
      if (s.open) fu += yao ? 16 : 8;
      else fu += yao ? 32 : 16;
    }
  }

  // Pinfu special: tsumo is always 20符 (no tsumo fu, no wait/pair/set fu)
  if (opts.isPinfu && opts.method === 'tsumo' && opts.isMenzen) return 20;

  return roundUpToTens(fu);
};

const detectYaku = (opts: {
  allTiles: TileId[];
  sets: SetShape[];
  pairTile: TileId | null;
  isMenzen: boolean;
  isRiichi: boolean;
  isDoubleRiichi: boolean;
  isIppatsu: boolean;
  isHaitei: boolean;
  isHoutei: boolean;
  method: WinMethod;
  roundWind: TileId;
  seatWind: TileId;
  shape: HandShape;
}): Yaku[] => {
  const yaku: Yaku[] = [];

  if (opts.isDoubleRiichi) yaku.push({ name: 'ダブル立直', han: 2 });
  else if (opts.isRiichi) yaku.push({ name: '立直', han: 1 });
  if ((opts.isRiichi || opts.isDoubleRiichi) && opts.isIppatsu) yaku.push({ name: '一発', han: 1 });
  if (opts.method === 'tsumo' && opts.isMenzen) yaku.push({ name: '門前清自摸和', han: 1 });
  if (opts.isHaitei) yaku.push({ name: '海底摸月', han: 1 });
  if (opts.isHoutei) yaku.push({ name: '河底撈魚', han: 1 });

  if (opts.shape.isSevenPairs) {
    yaku.push({ name: '七対子', han: 2 });
  } else {
    // Pinfu
    const allSequences = opts.sets.every((s) => s.kind === 'sequence');
    const pairIsValue =
      opts.pairTile !== null &&
      (opts.pairTile === 'z5' || opts.pairTile === 'z6' || opts.pairTile === 'z7' || opts.pairTile === opts.roundWind || opts.pairTile === opts.seatWind);
    if (opts.isMenzen && allSequences && !pairIsValue && opts.shape.isPinfuWait) yaku.push({ name: '平和', han: 1 });

    // Yakuhai (each)
    for (const s of opts.sets) {
      if (s.kind !== 'triplet' && s.kind !== 'quad') continue;
      const t = s.tile;
      if (t === 'z5' || t === 'z6' || t === 'z7') yaku.push({ name: '役牌：三元牌', han: 1 });
      if (t === opts.roundWind) yaku.push({ name: '役牌：場風牌', han: 1 });
      if (t === opts.seatWind) yaku.push({ name: '役牌：自風牌', han: 1 });
    }

    // Toitoi
    const allTriplets = opts.sets.every((s) => s.kind === 'triplet' || s.kind === 'quad');
    if (allTriplets) yaku.push({ name: '対々和', han: 2 });

    // Iipeikou / Ryanpeikou (menzen only)
    if (opts.isMenzen) {
      const seqKeys = opts.sets
        .filter((s): s is Extract<SetShape, { kind: 'sequence' }> => s.kind === 'sequence')
        .map((s) => {
          const suit = s.tiles[0][0];
          const start = Math.min(...s.tiles.map(tileNumber));
          return `${suit}${start}`;
        });
      const counts: Record<string, number> = {};
      for (const k of seqKeys) counts[k] = (counts[k] || 0) + 1;
      const pairs = Object.values(counts).reduce((sum, n) => sum + Math.floor(n / 2), 0);
      if (pairs >= 2) yaku.push({ name: '二盃口', han: 3 });
      else if (pairs === 1) yaku.push({ name: '一盃口', han: 1 });
    }

    // Sanankou (simplified: count concealed triplets/quads in the fixed decomposition)
    const concealedTriplets = opts.sets.filter(
      (s) => (s.kind === 'triplet' || s.kind === 'quad') && !s.open,
    ).length;
    if (concealedTriplets >= 3) yaku.push({ name: '三暗刻', han: 2 });

    // Sankantsu
    const kans = opts.sets.filter((s) => s.kind === 'quad').length;
    if (kans >= 3) yaku.push({ name: '三槓子', han: 2 });

    // Shousangen
    if (opts.pairTile === 'z5' || opts.pairTile === 'z6' || opts.pairTile === 'z7') {
      const dragons = new Set(
        opts.sets
          .filter((s) => s.kind === 'triplet' || s.kind === 'quad')
          .map((s) => (s.kind === 'triplet' || s.kind === 'quad' ? s.tile : null))
          .filter((t): t is TileId => t === 'z5' || t === 'z6' || t === 'z7'),
      );
      dragons.delete(opts.pairTile);
      if (dragons.size === 2) yaku.push({ name: '小三元', han: 2 });
    }

    // Sanshoku doujun / Ittsu (kuisagari supported)
    const seqStarts = opts.sets
      .filter((s): s is Extract<SetShape, { kind: 'sequence' }> => s.kind === 'sequence')
      .map((s) => {
        const suit = s.tiles[0][0];
        const start = Math.min(...s.tiles.map(tileNumber));
        return { suit, start };
      });
    const hasSeq = (suit: string, start: number) => seqStarts.some((x) => x.suit === suit && x.start === start);
    for (let start = 1; start <= 7; start++) {
      if (hasSeq('m', start) && hasSeq('p', start) && hasSeq('s', start)) {
        yaku.push({ name: '三色同順', han: opts.isMenzen ? 2 : 1 });
        break;
      }
    }
    for (const suit of ['m', 'p', 's'] as const) {
      if (hasSeq(suit, 1) && hasSeq(suit, 4) && hasSeq(suit, 7)) {
        yaku.push({ name: '一気通貫', han: opts.isMenzen ? 2 : 1 });
        break;
      }
    }

    // Sanshoku doukou
    const tripletNums = opts.sets
      .filter((s): s is Extract<SetShape, { kind: 'triplet' | 'quad' }> => s.kind === 'triplet' || s.kind === 'quad')
      .map((s) => s.tile)
      .filter((t) => t[0] !== 'z')
      .map((t) => ({ suit: t[0], num: tileNumber(t) }));
    for (let num = 1; num <= 9; num++) {
      const hasM = tripletNums.some((x) => x.suit === 'm' && x.num === num);
      const hasP = tripletNums.some((x) => x.suit === 'p' && x.num === num);
      const hasS = tripletNums.some((x) => x.suit === 's' && x.num === num);
      if (hasM && hasP && hasS) {
        yaku.push({ name: '三色同刻', han: 2 });
        break;
      }
    }

    // Chanta / Junchan
    const allParts: (TileId | TileId[])[] = [
      ...(opts.pairTile ? [opts.pairTile] : []),
      ...opts.sets.map((s) => (s.kind === 'sequence' ? s.tiles : s.tile)),
    ];
    const partHasYaochu = (part: TileId | TileId[]) => {
      const tiles = Array.isArray(part) ? part : [part];
      return tiles.some((t) => isTerminalOrHonor(t));
    };
    const partHasHonor = (part: TileId | TileId[]) => {
      const tiles = Array.isArray(part) ? part : [part];
      return tiles.some((t) => isHonor(t));
    };
    const allHaveYaochu = allParts.length > 0 && allParts.every(partHasYaochu);
    if (allHaveYaochu) {
      const hasHonor = allParts.some(partHasHonor);
      if (!hasHonor) yaku.push({ name: '純全帯么九', han: opts.isMenzen ? 3 : 2 });
      else yaku.push({ name: '混全帯么九', han: opts.isMenzen ? 2 : 1 });
    }
  }

  // Tanyao (works for chiitoi too)
  if (allTilesAreTanyao(opts.allTiles)) yaku.push({ name: '断么九', han: 1 });

  // Honroutou (terminals/honors only and no sequences)
  const allYaochuOnly = opts.allTiles.every((t) => isTerminalOrHonor(t));
  const hasSequence = opts.sets.some((s) => s.kind === 'sequence');
  if (allYaochuOnly && !hasSequence && !opts.shape.isSevenPairs) yaku.push({ name: '混老頭', han: 2 });

  // Honitsu / Chinitsu
  const hasHonor = opts.allTiles.some((t) => isHonor(t));
  const suits = suitsInTiles(opts.allTiles);
  if (suits.size === 1) {
    if (hasHonor) yaku.push({ name: '混一色', han: opts.isMenzen ? 3 : 2 });
    else yaku.push({ name: '清一色', han: opts.isMenzen ? 6 : 5 });
  }

  return yaku;
};

const detectLimitName = (han: number, fu: number) => {
  if (han >= 13) return { name: '数え役満', base: 8000 };
  if (han >= 11) return { name: '三倍満', base: 6000 };
  if (han >= 8) return { name: '倍満', base: 4000 };
  if (han >= 6) return { name: '跳満', base: 3000 };
  const isMangan = han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70);
  if (isMangan) return { name: '満貫', base: 2000 };
  return null;
};

const calcTotalPoints = (method: WinMethod, isDealer: boolean, basePoints: number) => {
  if (method === 'ron') {
    const mult = isDealer ? 6 : 4;
    return roundUpToHundreds(basePoints * mult);
  }
  // tsumo: sum of payments (4-player total), then used as delta in 2-player game
  if (isDealer) {
    const payment = roundUpToHundreds(basePoints * 2);
    return payment * 3;
  }
  const dealerPayment = roundUpToHundreds(basePoints * 2);
  const nonDealerPayment = roundUpToHundreds(basePoints);
  return dealerPayment + nonDealerPayment * 2;
};

const pickBestResult = (results: ScoreResult[]): ScoreResult => {
  // Prefer higher total points, then higher han, then higher fu.
  return results.sort((a, b) => b.totalPoints - a.totalPoints || b.han - a.han || b.fu - a.fu)[0];
};

export const calculateScore = (opts: {
  concealedTiles: TileId[]; // 14 tiles (hand + winning tile)
  melds: Meld[];
  method: WinMethod;
  isDealer: boolean;
  isRiichi: boolean;
  isDoubleRiichi?: boolean;
  isIppatsu?: boolean;
  isHaitei?: boolean;
  isHoutei?: boolean;
  doraIndicators: TileId[];
  uraIndicators: TileId[];
  roundWind: TileId; // z1..z4
  seatWind: TileId; // z1..z4
  winTile: TileId;
}): ScoreResult => {
  const isMenzen = opts.melds.length === 0;
  const openSetShapes = buildMeldShapes(opts.melds);

  const meldTileInstances = opts.melds.flatMap((m) => m.tiles);
  const allTiles = [...opts.concealedTiles, ...meldTileInstances];

  const preWinConcealedTiles = removeOneTile(opts.concealedTiles, opts.winTile);
  const possibleWinTiles = listPossibleWinTiles({
    preWinConcealedTiles,
    openSetCount: openSetShapes.length,
  });

  // special: chiitoi only possible when menzen
  const chiitoiPossible = isMenzen && isChiitoi(opts.concealedTiles);

  const candidateShapes: HandShape[] = [];
  if (chiitoiPossible) {
    candidateShapes.push({
      isSevenPairs: true,
      pairTile: null,
      sets: [],
      waitFu: 0,
      isPinfuWait: false,
    });
  }

  const requiredConcealedSetCount = 4 - openSetShapes.length;
  if (requiredConcealedSetCount >= 0) {
    const shapes = extractAllConcealedShapes(opts.concealedTiles, requiredConcealedSetCount, opts.winTile);
    for (const s of shapes) {
      // "Nobetan" wait: if the hand is a one-tile wait but this fixed decomposition looks like ryanmen,
      // treat it as 2符.
      const normalizedWinTile = baseTile(opts.winTile);
      const isSingleTileWait = possibleWinTiles.size === 1 && possibleWinTiles.has(normalizedWinTile);
      const waitFu = isSingleTileWait && s.waitFu === 0 ? 2 : s.waitFu;
      candidateShapes.push({
        ...s,
        waitFu,
        isPinfuWait: waitFu === 0,
        sets: [...openSetShapes, ...s.sets],
      });
    }
  }

  if (!candidateShapes.length) {
    // Fallback: still return dora-only score (should not normally happen)
    const doraHan = countDora(allTiles, opts.doraIndicators);
    const akaDoraHan = countAkaDora(allTiles);
    const riichiLike = opts.isRiichi || opts.isDoubleRiichi;
    const uraDoraHan = riichiLike ? countDora(allTiles, opts.uraIndicators) : 0;
    const han = doraHan + akaDoraHan + uraDoraHan;
    const fu = 20;
    const limit = detectLimitName(han, fu);
    const base = limit ? limit.base : fu * Math.pow(2, han + 2);
    return {
      yaku: [],
      han,
      fu,
      limitName: limit?.name ?? null,
      basePoints: base,
      totalPoints: calcTotalPoints(opts.method, opts.isDealer, base),
      doraHan,
      akaDoraHan,
      uraDoraHan,
    };
  }

  const results: ScoreResult[] = candidateShapes.map((shape) => {
    const sets = shape.isSevenPairs ? openSetShapes : shape.sets;
    const pairTile = shape.pairTile;
    const yaku = detectYaku({
      allTiles,
      sets,
      pairTile,
      isMenzen,
      isRiichi: opts.isRiichi,
      isDoubleRiichi: opts.isDoubleRiichi ?? false,
      isIppatsu: opts.isIppatsu ?? false,
      isHaitei: opts.isHaitei ?? false,
      isHoutei: opts.isHoutei ?? false,
      method: opts.method,
      roundWind: opts.roundWind,
      seatWind: opts.seatWind,
      shape,
    });

    const baseYakuHan = yaku.reduce((sum, y) => sum + y.han, 0);
    const doraHan = countDora(allTiles, opts.doraIndicators);
    const akaDoraHan = countAkaDora(allTiles);
    const riichiLike = opts.isRiichi || opts.isDoubleRiichi;
    const uraDoraHan = riichiLike ? countDora(allTiles, opts.uraIndicators) : 0;
    const han = baseYakuHan + doraHan + akaDoraHan + uraDoraHan;

    const isPinfu = yaku.some((y) => y.name === '平和');
    const fu = calcFu({
      isMenzen,
      method: opts.method,
      isPinfu,
      roundWind: opts.roundWind,
      seatWind: opts.seatWind,
      shape: shape.isSevenPairs ? shape : { ...shape, sets },
    });

    const limit = detectLimitName(han, fu);
    const basePoints = limit ? limit.base : fu * Math.pow(2, han + 2);

    const scoreYaku: Yaku[] = [...yaku];
    if (doraHan > 0) scoreYaku.push({ name: `ドラ ${doraHan}`, han: doraHan });
    if (akaDoraHan > 0) scoreYaku.push({ name: `赤ドラ ${akaDoraHan}`, han: akaDoraHan });
    if (uraDoraHan > 0) scoreYaku.push({ name: `裏ドラ ${uraDoraHan}`, han: uraDoraHan });

    return {
      yaku: scoreYaku,
      han,
      fu,
      limitName: limit?.name ?? null,
      basePoints,
      totalPoints: calcTotalPoints(opts.method, opts.isDealer, basePoints),
      doraHan,
      akaDoraHan,
      uraDoraHan,
    };
  });

  return pickBestResult(results);
};
