import { calculateScore } from '../src/lib/mahjong/scoring';

const assertEqual = (name: string, actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${String(expected)}, got ${String(actual)}`);
  }
};

const run = () => {
  // Open hand (no menzen-ron +10), all sequences, non-value pair, ryanmen wait => 20符 (no 30符 minimum).
  {
    const result = calculateScore({
      concealedTiles: ['s4', 's5', 's6', 'p2', 'p2'], // 1 set + pair (winning tile included)
      melds: [
        { type: 'chi', tiles: ['m2', 'm3', 'm4'] },
        { type: 'chi', tiles: ['m4', 'm5', 'm6'] },
        { type: 'chi', tiles: ['p3', 'p4', 'p5'] },
      ],
      method: 'ron',
      isDealer: false,
      isRiichi: false,
      doraIndicators: [],
      uraIndicators: [],
      roundWind: 'z1',
      seatWind: 'z2',
      winTile: 's6',
    });
    assertEqual('open-ryanmen-fu', result.fu, 20);
  }

  // Chiitoitsu is always 25符.
  {
    const result = calculateScore({
      concealedTiles: ['m2', 'm2', 'm3', 'm3', 'p4', 'p4', 'p5', 'p5', 's6', 's6', 's7', 's7', 's8', 's8'],
      melds: [],
      method: 'ron',
      isDealer: false,
      isRiichi: false,
      doraIndicators: [],
      uraIndicators: [],
      roundWind: 'z1',
      seatWind: 'z2',
      winTile: 's8',
    });
    assertEqual('chiitoi-fu', result.fu, 25);
  }

  // Value pair is a flat +2符 (no double-wind stacking).
  {
    const result = calculateScore({
      concealedTiles: ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'z5', 'z5', 'z5', 'z1', 'z1'],
      melds: [],
      method: 'ron',
      isDealer: false,
      isRiichi: false,
      doraIndicators: [],
      uraIndicators: [],
      roundWind: 'z1',
      seatWind: 'z1',
      winTile: 's4',
    });
    assertEqual('double-wind-pair-fu', result.fu, 40);
  }
};

run();

