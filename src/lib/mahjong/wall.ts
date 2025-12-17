export type WallTileId = string;

type TileType = 'man' | 'pin' | 'sou' | 'honor';

const TILE_DEFS: Array<{ type: TileType; max: number }> = [
  { type: 'man', max: 9 },
  { type: 'pin', max: 9 },
  { type: 'sou', max: 9 },
  { type: 'honor', max: 7 },
];

export const shuffleInPlace = <T>(arr: T[], rng: () => number = Math.random): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const createWall = (): WallTileId[] => {
  const wall: WallTileId[] = [];
  for (const def of TILE_DEFS) {
    for (let number = 1; number <= def.max; number++) {
      for (let index = 0; index < 4; index++) {
        wall.push(`${def.type}-${number}-${index}`);
      }
    }
  }
  return wall;
};

const tileBaseFromId = (tileId: WallTileId): string => {
  const dashParts = tileId.split('-');
  if (dashParts.length >= 3) {
    const [type, numStr] = dashParts;
    const number = parseInt(numStr ?? '', 10);
    const suit = type === 'man' ? 'm' : type === 'pin' ? 'p' : type === 'sou' ? 's' : type === 'honor' ? 'z' : null;
    if (suit && Number.isFinite(number)) return `${suit}${number}`;
  }
  return tileId.split('_')[0] ?? tileId;
};

export const assertWallIntegrity = (wall: WallTileId[]) => {
  if (wall.length !== 136) throw new Error(`invalid wall length: expected 136, got ${wall.length}`);

  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  for (const tileId of wall) {
    if (ids.has(tileId)) throw new Error(`duplicate tile id in wall: ${tileId}`);
    ids.add(tileId);
    const base = tileBaseFromId(tileId);
    counts[base] = (counts[base] ?? 0) + 1;
    if (counts[base] > 4) throw new Error(`too many copies of ${base} in wall: ${counts[base]}`);
  }
};

export const createShuffledWall = (rng: () => number = Math.random): WallTileId[] => {
  const wall = createWall();
  shuffleInPlace(wall, rng);
  assertWallIntegrity(wall);
  return wall;
};

