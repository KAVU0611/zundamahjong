export type ZundaQuoteCategory =
  | 'DEFENSE'
  | 'OFFENSE'
  | 'SAFE_TILE'
  | 'EARLY_GAME'
  | 'DRAW_TENPAI'
  | 'DRAW_NOTEN'
  | 'WIN_SMALL_RON'
  | 'WIN_SMALL_TSUMO'
  | 'WIN_BIG'
  | 'GAME_WIN'
  | 'PLAYER_WIN_LOW'
  | 'PLAYER_WIN_HIGH'
  | 'PLAYER_WIN_GENERIC';

export const ZundamonQuotes: Record<ZundaQuoteCategory, string[]> = {
  DEFENSE: [
    'うわ、リーチなのだ…。統計的にここは「オリ」が正解なのだ。君のその安そうな手に振り込むほど、ボクは馬鹿じゃないのだ。',
    'はいはい撤退撤退。君のリーチ、なんか「待ち」が透けて見えるのだ。そんな見え見えの罠にかかるわけないのだ。',
  ],
  OFFENSE: [
    'は？ そのリーチ、ブラフでしょ？ 期待値計算した結果、ボクのこの手は「全ツッパ」が最適解と出たのだ！！',
    'リスクリターンも計算できないの？ このドラは通る……いや、通す！！ 君の運だけのリーチなんて怖くないのだ！！',
  ],
  SAFE_TILE: [
    'はいはい、安パイ。君のリーチ、全然プレッシャーないんだけど？',
    'はいはい、安全策安全策。そんなにボクのロンが怖いのだ？ ビビり散らかしてるのが手に取るようにわかるのだｗ',
  ],
  EARLY_GAME: [
    'ふふん、手牌が育ってきたのだ。今のうちに逃げる準備したほうがいいんじゃない？ 後で泣いても知らないのだ。',
    'ボクの配牌、良すぎて笑いが止まらないのだ。君の手牌、なんかゴミ溜めみたいになってない？',
  ],
  DRAW_TENPAI: [
    '危なかったねー。シミュレーションでは次のツモでボクが上がってたのだ。君の寿命が少し伸びただけなのだ。',
  ],
  DRAW_NOTEN: [
    '……あえてテンパイを取らなかったのだ。これが「回し打ち」の極意。放銃回避を最優先した高度な戦術……君には理解できない高尚なプレイなのだ。',
  ],
  WIN_SMALL_RON: [
    'はい、あがり。え？安い？点数じゃないのだ。キミの「流れ」を断ち切るのが目的なのだ、雑魚。',
  ],
  WIN_SMALL_TSUMO: [
    'あがり。安い？ 関係ないのだ。早あがりで君の親番を流すのが、デジタル麻雀の基本なのだ。',
  ],
  WIN_BIG: [
    'これが実力、これが知性なのだ！！ 君の非効率な打牌に対する、統計学からの鉄槌なのだ！！ 点棒置いてさっさと席を立つのだ！',
  ],
  GAME_WIN: [
    '当然の結果なのだ。君とボクとでは、積んでるCPUのスペックが違いすぎたのだ。悔しかったら課金して出直してくるのだ！ まあ、何度やってもボクが勝つけどね！ お疲れ様、養分さん！',
    '圧倒的勝利なのだ！ 人類の知能なんて、所詮この程度なのだ。ボクに勝とうなんて100万年早かったね。',
    '対戦ありがとうございましたー。君の打牌データ、いい学習サンプルになったよ。養分になってくれて感謝するのだ。',
  ],
  PLAYER_WIN_LOW: [
    'えっ、それだけ？ その点数のためにボクの手を蹴ったの？ コスパ悪すぎなのだ。',
    '必死にアガってそれ？ 駄菓子代にもならないのだｗ',
  ],
  PLAYER_WIN_HIGH: [
    'はいはい、よかったねー。すごいすごい（棒）。これで満足なのだ？',
    'へー、高打点？ おめでとうなのだ。……まさか、たかがゲームの点数で人生勝った気になってないよね？',
    'あーはいはい、強い強い。運だけは一人前なのだ。一応拍手してあげるのだ。（パチパチパチ）',
  ],
  PLAYER_WIN_GENERIC: [
    'はいはいおめでとう。君の人生の運、今ので全部使い果たしたのだw',
    'まあ、たまには勝たせてあげないとね。これは「接待」なのだ。',
  ],
};

// Pre-generated voice asset paths (served from public/sounds/voice/quotes)
export const ZundamonQuoteAudio: Partial<Record<ZundaQuoteCategory, string[]>> = {
  DEFENSE: ['/sounds/voice/quotes/DEFENSE_0.wav', '/sounds/voice/quotes/DEFENSE_1.wav'],
  OFFENSE: ['/sounds/voice/quotes/OFFENSE_0.wav', '/sounds/voice/quotes/OFFENSE_1.wav'],
  SAFE_TILE: ['/sounds/voice/quotes/SAFE_TILE_0.wav', '/sounds/voice/quotes/SAFE_TILE_1.wav'],
  EARLY_GAME: ['/sounds/voice/quotes/EARLY_GAME_0.wav', '/sounds/voice/quotes/EARLY_GAME_1.wav'],
  DRAW_TENPAI: ['/sounds/voice/quotes/DRAW_TENPAI_0.wav'],
  DRAW_NOTEN: ['/sounds/voice/quotes/DRAW_NOTEN_0.wav'],
  WIN_SMALL_RON: ['/sounds/voice/quotes/WIN_SMALL_0.wav'],
  WIN_SMALL_TSUMO: ['/sounds/voice/quotes/WIN_SMALL_TSUMO_0.wav'],
  WIN_BIG: ['/sounds/voice/quotes/WIN_BIG_0.wav'],
  GAME_WIN: ['/sounds/voice/quotes/GAME_WIN_0.wav', '/sounds/voice/quotes/GAME_WIN_1.wav', '/sounds/voice/quotes/GAME_WIN_2.wav'],
  PLAYER_WIN_LOW: ['/sounds/voice/quotes/PLAYER_WIN_LOW_0.wav', '/sounds/voice/quotes/PLAYER_WIN_LOW_1.wav'],
  PLAYER_WIN_HIGH: [
    '/sounds/voice/quotes/PLAYER_WIN_HIGH_0.wav',
    '/sounds/voice/quotes/PLAYER_WIN_HIGH_1.wav',
    '/sounds/voice/quotes/PLAYER_WIN_HIGH_2.wav',
  ],
  PLAYER_WIN_GENERIC: ['/sounds/voice/quotes/PLAYER_WIN_GENERIC_0.wav', '/sounds/voice/quotes/PLAYER_WIN_GENERIC_1.wav'],
};

export const pickZundaQuote = (category: ZundaQuoteCategory): string => {
  const list = ZundamonQuotes[category] || [];
  if (!list.length) return '';
  if (list.length === 1) return list[0]!;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] || list[0]!;
};
