'use client';

import React from 'react';
import Image from 'next/image';
import { useMahjong, TileId, GameState } from '../hooks/useMahjong';

// 牌IDを画像パスに変換する辞書
const TILE_ID_TO_IMAGE_MAP: Record<string, string> = {
    // 萬子
    m1: 'Man1', m2: 'Man2', m3: 'Man3', m4: 'Man4', m5: 'Man5', m6: 'Man6', m7: 'Man7', m8: 'Man8', m9: 'Man9',
    // 筒子
    p1: 'Pin1', p2: 'Pin2', p3: 'Pin3', p4: 'Pin4', p5: 'Pin5', p6: 'Pin6', p7: 'Pin7', p8: 'Pin8', p9: 'Pin9',
    // 索子
    s1: 'Sou1', s2: 'Sou2', s3: 'Sou3', s4: 'Sou4', s5: 'Sou5', s6: 'Sou6', s7: 'Sou7', s8: 'Sou8', s9: 'Sou9',
    // 字牌 (z1:東, z2:南, z3:西, z4:北, z5:白, z6:發, z7:中)
    z1: 'Ton', z2: 'Nan', z3: 'Shaa', z4: 'Pei', z5: 'Haku', z6: 'Hatsu', z7: 'Chun',
};

// 牌IDから画像ファイルパスを取得するヘルパー関数
const getTilePath = (tileId: TileId): string => {
    const tileName = TILE_ID_TO_IMAGE_MAP[tileId];
    return `/tiles/${tileName}.png`;
};

// 牌コンポーネント
type TileProps = {
    tileId?: TileId | null;
    isBack?: boolean;
    onClick?: () => void;
    className?: string;
};

const Tile: React.FC<TileProps> = ({ tileId, isBack = false, onClick, className = '' }) => {
    const baseStyle = "w-10 h-14 rounded-md shadow-md cursor-pointer transform transition-transform hover:-translate-y-1";
    const thicknessStyle = "border-b-4 border-gray-400";

    if (isBack) {
        return (
            <div className={`${baseStyle} ${thicknessStyle} ${className}`}>
                 <Image src="/tiles/Back.png" alt="Tile back" width={40} height={56} className="w-full h-full rounded-md" />
            </div>
        );
    }

    if (!tileId) return null;

    return (
        <div onClick={onClick} className={`${baseStyle} ${thicknessStyle} relative bg-white ${className}`}>
            {/* 1層目: 土台 */}
            <Image src="/tiles/Front.png" alt="Tile front base" layout="fill" className="absolute inset-0 w-full h-full rounded-md" />
            {/* 2層目: 絵柄 */}
            <Image src={getTilePath(tileId)} alt={tileId} layout="fill" className="relative z-10 w-full h-full object-contain p-1" />
        </div>
    );
};

// ずんだもんの状態に対応する画像とセリフ
const ZUNDAMON_STATES = {
    waiting: { img: 'normal.png', text: '麻雀するのだ！' },
    player_turn: { img: 'normal.png', text: 'あなたの番なのだ。' },
    opponent_turn: { img: 'aori.png', text: '僕のターンなのだ！' },
    player_win: { img: 'win.png', text: 'お見事なのだ！' },
    opponent_win: { img: 'lose.png', text: '僕の勝ちなのだ！' },
    draw: { img: 'bored.png', text: '流局なのだ。' },
};

const Zundamon: React.FC<{ gameState: GameState }> = ({ gameState }) => {
    const state = ZUNDAMON_STATES[gameState] || ZUNDAMON_STATES.waiting;
    return (
        <div className="flex flex-col items-center justify-center">
            <div className="w-48 h-48 relative">
                <Image src={`/zunda/${state.img}`} alt="Zundamon" layout="fill" objectFit="contain" />
            </div>
            <div className="mt-2 p-2 bg-white rounded-lg shadow-md text-center text-gray-800">
                <p>{state.text}</p>
            </div>
        </div>
    );
};

// メインページコンポーネント
export default function MahjongPage() {
    const { gameState, playerHand, opponentHand, playerRiver, opponentRiver, drawnTile, wall, startGame, discardTile } = useMahjong();

    return (
        <main className="flex flex-col items-center justify-center min-h-screen bg-green-800 text-white p-4 font-sans">
            <h1 className="text-4xl font-bold mb-4">ずんだ麻雀</h1>

            {gameState === 'waiting' && (
                <button onClick={startGame} className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-bold shadow-lg">
                    ゲーム開始
                </button>
            )}

            <div className="w-full max-w-4xl grid grid-rows-[auto_1fr_auto_1fr_auto] gap-4">
                {/* 相手の捨て牌 */}
                <div className="h-20 flex flex-wrap items-center justify-center gap-1 p-2 bg-green-900/50 rounded-lg">
                    {opponentRiver.map((tile, i) => <Tile key={i} tileId={tile} className="w-8 h-12 shadow-none cursor-default transform-none" />)}
                </div>

                {/* 相手の手牌 */}
                <div className="h-16 flex items-center justify-center gap-1">
                    {opponentHand.map((_, i) => <Tile key={i} isBack={true} className="cursor-default transform-none" />)}
                </div>
                
                {/* 中央エリア */}
                <div className="flex items-center justify-around h-64">
                    <div className="text-center">
                        <p className="font-bold text-lg">山</p>
                        <p className="text-2xl">{wall.length}</p>
                    </div>
                    <Zundamon gameState={gameState} />
                    <div className="text-center">
                        <p className="font-bold text-lg">残り</p>
                        <p className="text-2xl">{wall.length}</p>
                    </div>
                </div>

                {/* 自分の捨て牌 */}
                 <div className="h-20 flex flex-wrap items-center justify-center gap-1 p-2 bg-green-900/50 rounded-lg">
                    {playerRiver.map((tile, i) => <Tile key={i} tileId={tile} className="w-8 h-12 shadow-none cursor-default transform-none" />)}
                </div>

                {/* 自分の手牌とツモ牌 */}
                <div className="flex flex-col items-center gap-4">
                    <div className="h-16 flex items-center justify-center gap-1">
                        {playerHand.map((tile, i) => (
                            <Tile key={`${tile}-${i}`} tileId={tile} onClick={() => discardTile(i, false)} />
                        ))}
                        {drawnTile && (
                           <div className="ml-4">
                                <Tile tileId={drawnTile} onClick={() => discardTile(0, true)} />
                           </div>
                        )}
                    </div>
                </div>
            </div>

            {(gameState === 'player_win' || gameState === 'opponent_win' || gameState === 'draw') && (
                 <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                     <p className="text-5xl font-bold mb-8">
                         {gameState === 'player_win' && 'あなたの勝ち！'}
                         {gameState === 'opponent_win' && 'ずんだもんの勝ち！'}
                         {gameState === 'draw' && '流局'}
                     </p>
                    <button onClick={startGame} className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-xl font-bold shadow-lg">
                        もう一度
                    </button>
                </div>
            )}
        </main>
    );
}