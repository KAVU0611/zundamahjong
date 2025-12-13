import { useState, useEffect, useCallback } from 'react';

// 牌のID型 (例: 'm1', 'p5', 'z3')
export type TileId = string;

// ゲームの状態
export type GameState = 'waiting' | 'player_turn' | 'opponent_turn' | 'player_win' | 'opponent_win' | 'draw';

// 各牌の定義 (m:萬子, p:筒子, s:索子, z:字牌)
const TILE_TYPES = {
  m: 9, // 萬子1-9
  p: 9, // 筒子1-9
  s: 9, // 索子1-9
  z: 7, // 字牌1-7 (東南西北白發中)
};

// 初期山を生成する関数
const createInitialWall = (): TileId[] => {
  const wall: TileId[] = [];
  for (const [suit, count] of Object.entries(TILE_TYPES)) {
    for (let i = 1; i <= count; i++) {
      // 各牌を4枚ずつ追加
      for (let j = 0; j < 4; j++) {
        wall.push(`${suit}${i}`);
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
};

// 手牌をソートする比較関数
const sortHand = (a: TileId, b: TileId) => a.localeCompare(b);

export const useMahjong = () => {
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [wall, setWall] = useState<TileId[]>([]);
  const [playerHand, setPlayerHand] = useState<TileId[]>([]);
  const [opponentHand, setOpponentHand] = useState<TileId[]>([]);
  const [playerRiver, setPlayerRiver] = useState<TileId[]>([]);
  const [opponentRiver, setOpponentRiver] = useState<TileId[]>([]);
  const [drawnTile, setDrawnTile] = useState<TileId | null>(null);

  // ゲーム開始処理
  const startGame = useCallback(() => {
    const initialWall = createInitialWall();
    
    // 配牌
    const playerInitialHand = initialWall.splice(0, 13).sort(sortHand);
    const opponentInitialHand = initialWall.splice(0, 13).sort(sortHand);
    
    // プレイヤーの最初のツモ
    const firstDrawnTile = initialWall.shift()!;

    setWall(initialWall);
    setPlayerHand(playerInitialHand);
    setOpponentHand(opponentInitialHand);
    setPlayerRiver([]);
    setOpponentRiver([]);
    setDrawnTile(firstDrawnTile);
    setGameState('player_turn');
  }, []);

  // プレイヤーが牌を捨てる処理
  const discardTile = useCallback((tileIndex: number, isFromDrawn: boolean) => {
    if (gameState !== 'player_turn' || !wall.length) return;

    let discardedTile: TileId;
    const newPlayerHand = [...playerHand];

    if (isFromDrawn) {
        discardedTile = drawnTile!;
        setDrawnTile(null);
    } else {
        discardedTile = newPlayerHand.splice(tileIndex, 1)[0];
        newPlayerHand.push(drawnTile!);
        newPlayerHand.sort(sortHand);
        setDrawnTile(null);
    }

    setPlayerHand(newPlayerHand);
    setPlayerRiver(prev => [...prev, discardedTile]);
    
    if (wall.length === 0) {
        setGameState('draw');
        return;
    }

    setGameState('opponent_turn');
  }, [gameState, playerHand, drawnTile, wall]);


  // 対戦相手（CPU）のターン処理
  useEffect(() => {
    if (gameState !== 'opponent_turn') return;

    const opponentTurn = setTimeout(() => {
        if (wall.length === 0) {
            setGameState('draw');
            return;
        }
        
        // ツモ
        const newOpponentHand = [...opponentHand, wall.shift()!];
        
        // 一番不要そうな牌を捨てる（簡易ロジック）
        const discardIndex = Math.floor(Math.random() * newOpponentHand.length);
        const discardedTile = newOpponentHand.splice(discardIndex, 1)[0];
        
        setOpponentHand(newOpponentHand.sort(sortHand));
        setOpponentRiver(prev => [...prev, discardedTile]);

        if (wall.length === 0) {
            setGameState('draw');
            return;
        }
        
        // プレイヤーの次のツモ
        setDrawnTile(wall.shift()!);
        setGameState('player_turn');
    }, 1000); // 1秒後に実行

    return () => clearTimeout(opponentTurn);
  }, [gameState, opponentHand, wall]);

  return {
    gameState,
    playerHand,
    opponentHand,
    playerRiver,
    opponentRiver,
    drawnTile,
    wall,
    startGame,
    discardTile,
  };
};
