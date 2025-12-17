type Suit = 'm' | 'p' | 's' | 'z';

const TILE_BASES: string[] = (() => {
  const bases: string[] = [];
  for (const suit of ['m', 'p', 's'] as const) {
    for (let n = 1; n <= 9; n++) bases.push(`${suit}${n}`);
  }
  for (let n = 1; n <= 7; n++) bases.push(`z${n}`);
  return bases;
})();

const BASE_TO_INDEX = new Map<string, number>(TILE_BASES.map((b, i) => [b, i]));

export const allTileBases = [...TILE_BASES];

export type Counts34 = number[];

export const tileBaseToIndex = (base: string): number | null => {
  const idx = BASE_TO_INDEX.get(base);
  return idx === undefined ? null : idx;
};

export const counts34FromBases = (bases: string[]): Counts34 => {
  const counts = new Array<number>(34).fill(0);
  for (const base of bases) {
    const idx = BASE_TO_INDEX.get(base);
    if (idx === undefined) continue;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return counts;
};

const encodeCounts34 = (counts: Counts34) => counts.join('');

const shantenChiitoiFromCounts = (counts: Counts34) => {
  let pairCount = 0;
  let typeCount = 0;
  for (const ct of counts) {
    if (ct > 0) typeCount++;
    if (ct >= 2) pairCount += Math.floor(ct / 2);
  }
  const neededTypes = Math.max(0, 7 - typeCount);
  return 6 - pairCount + neededTypes;
};

const normalCache = new Map<string, number>();

const isSuitIndex = (i: number) => i >= 0 && i < 27;
const suitOfIndex = (i: number): Suit => (i < 9 ? 'm' : i < 18 ? 'p' : i < 27 ? 's' : 'z');
const numOfIndex = (i: number) => (i % 9) + 1;

const shantenNormalFromCounts = (counts: Counts34, meldCount: number) => {
  const cacheKey = `${meldCount}:${encodeCounts34(counts)}`;
  const cached = normalCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const stateMemo = new Map<string, number>();

  const dfs = (startIndex: number, mentsu: number, taatsu: number, hasPair: boolean): number => {
    const memoKey = `${startIndex}|${mentsu}|${taatsu}|${hasPair ? 1 : 0}|${encodeCounts34(counts)}`;
    const memoHit = stateMemo.get(memoKey);
    if (memoHit !== undefined) return memoHit;

    const totalMentsu = meldCount + mentsu;
    if (totalMentsu > 4) return 8;

    let idx = -1;
    for (let i = startIndex; i < 34; i++) {
      if ((counts[i] ?? 0) > 0) {
        idx = i;
        break;
      }
    }

    if (idx === -1) {
      let m = meldCount + mentsu;
      let t = taatsu;
      const p = hasPair ? 1 : 0;
      if (m > 4) m = 4;
      if (m + t > 4) t = 4 - m;
      const shanten = 8 - 2 * m - t - p;
      stateMemo.set(memoKey, shanten);
      return shanten;
    }

    let best = 8;

    // Option: ignore one tile (as isolated)
    counts[idx]!--;
    best = Math.min(best, dfs(idx, mentsu, taatsu, hasPair));
    counts[idx]!++;

    // Triplet
    if ((counts[idx] ?? 0) >= 3) {
      counts[idx]! -= 3;
      best = Math.min(best, dfs(idx, mentsu + 1, taatsu, hasPair));
      counts[idx]! += 3;
    }

    // Sequence
    if (isSuitIndex(idx) && suitOfIndex(idx) !== 'z') {
      const n = numOfIndex(idx);
      if (n <= 7) {
        const i1 = idx + 1;
        const i2 = idx + 2;
        if ((counts[i1] ?? 0) > 0 && (counts[i2] ?? 0) > 0) {
          counts[idx]!--;
          counts[i1]!--;
          counts[i2]!--;
          best = Math.min(best, dfs(idx, mentsu + 1, taatsu, hasPair));
          counts[idx]!++;
          counts[i1]!++;
          counts[i2]!++;
        }
      }
    }

    // Pair (head candidate)
    if (!hasPair && (counts[idx] ?? 0) >= 2) {
      counts[idx]! -= 2;
      best = Math.min(best, dfs(idx, mentsu, taatsu, true));
      counts[idx]! += 2;
    }

    // Taatsu: ryanmen/penchan (idx, idx+1)
    if (isSuitIndex(idx) && suitOfIndex(idx) !== 'z') {
      const n = numOfIndex(idx);
      if (n <= 8) {
        const i1 = idx + 1;
        if ((counts[i1] ?? 0) > 0) {
          counts[idx]!--;
          counts[i1]!--;
          best = Math.min(best, dfs(idx, mentsu, taatsu + 1, hasPair));
          counts[idx]!++;
          counts[i1]!++;
        }
      }
      // Taatsu: kanchan (idx, idx+2)
      if (n <= 7) {
        const i2 = idx + 2;
        if ((counts[i2] ?? 0) > 0) {
          counts[idx]!--;
          counts[i2]!--;
          best = Math.min(best, dfs(idx, mentsu, taatsu + 1, hasPair));
          counts[idx]!++;
          counts[i2]!++;
        }
      }
    }

    stateMemo.set(memoKey, best);
    return best;
  };

  const best = dfs(0, 0, 0, false);
  normalCache.set(cacheKey, best);
  return best;
};

export const calculateShantenFromCounts = (counts: Counts34, meldCount: number) => {
  const normal = shantenNormalFromCounts(counts, meldCount);
  const chiitoi = meldCount === 0 ? shantenChiitoiFromCounts(counts) : Number.POSITIVE_INFINITY;
  return Math.min(normal, chiitoi);
};

export const calculateShanten = (bases: string[], meldCount: number) => calculateShantenFromCounts(counts34FromBases(bases), meldCount);
