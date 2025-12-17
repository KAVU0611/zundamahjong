import { calculateScore, nextDoraTile } from '../src/lib/mahjong/scoring';

const assertEqual = (name: string, actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${String(expected)}, got ${String(actual)}`);
  }
};

const scoreDoraHan = (opts: { tiles: string[]; winTile: string; indicator: string }) => {
  const result = calculateScore({
    concealedTiles: opts.tiles,
    melds: [],
    method: 'ron',
    isDealer: false,
    isRiichi: false,
    doraIndicators: [opts.indicator],
    uraIndicators: [],
    roundWind: 'z1',
    seatWind: 'z2',
    winTile: opts.winTile,
  });
  return result.doraHan;
};

const run = () => {
  // Quick direct mapping sanity checks
  assertEqual('nextDoraTile(west)->north', nextDoraTile('honor-3-0'), 'z4');
  assertEqual('nextDoraTile(9m)->1m', nextDoraTile('man-9-0'), 'm1');
  assertEqual('nextDoraTile(9p)->1p', nextDoraTile('pin-9-0'), 'p1');
  assertEqual('nextDoraTile(9s)->1s', nextDoraTile('sou-9-0'), 's1');

  // Count sanity checks (use dash-format tiles to cover normalization bugs)
  {
    const tiles = [
      'man-1-0',
      'man-2-0',
      'man-4-0',
      'pin-2-0',
      'pin-5-0',
      'pin-7-0',
      'sou-3-0',
      'sou-5-0',
      'sou-7-0',
      'honor-1-0',
      'honor-2-0',
      'honor-4-0', // 北
      'honor-5-0',
      'honor-7-0',
    ];
    const doraHan = scoreDoraHan({ tiles, winTile: 'honor-7-0', indicator: 'honor-3-1' }); // 表示牌: 西
    assertEqual('indicator west + hand north => dora 1', doraHan, 1);
  }

  {
    const tiles = [
      'man-1-0', // 1m (dora)
      'man-2-0',
      'man-4-0',
      'pin-2-0',
      'pin-5-0',
      'pin-7-0',
      'sou-3-0',
      'sou-5-0',
      'sou-7-0',
      'honor-1-0',
      'honor-2-0',
      'honor-4-0',
      'honor-5-0',
      'honor-7-0',
    ];
    const doraHan = scoreDoraHan({ tiles, winTile: 'honor-7-0', indicator: 'man-9-0' }); // 表示牌: 9m
    assertEqual('indicator 9m => dora 1m', doraHan, 1);
  }

  {
    const tiles = [
      'pin-1-0', // 1p (dora)
      'man-2-0',
      'man-4-0',
      'pin-2-0',
      'pin-5-0',
      'pin-7-0',
      'sou-3-0',
      'sou-5-0',
      'sou-7-0',
      'honor-1-0',
      'honor-2-0',
      'honor-4-0',
      'honor-5-0',
      'honor-7-0',
    ];
    const doraHan = scoreDoraHan({ tiles, winTile: 'honor-7-0', indicator: 'pin-9-0' }); // 表示牌: 9p
    assertEqual('indicator 9p => dora 1p', doraHan, 1);
  }

  {
    const tiles = [
      'sou-1-0', // 1s (dora)
      'man-2-0',
      'man-4-0',
      'pin-2-0',
      'pin-5-0',
      'pin-7-0',
      'sou-3-0',
      'sou-5-0',
      'sou-7-0',
      'honor-1-0',
      'honor-2-0',
      'honor-4-0',
      'honor-5-0',
      'honor-7-0',
    ];
    const doraHan = scoreDoraHan({ tiles, winTile: 'honor-7-0', indicator: 'sou-9-0' }); // 表示牌: 9s
    assertEqual('indicator 9s => dora 1s', doraHan, 1);
  }
};

run();

