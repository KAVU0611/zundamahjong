import { type ZundaQuoteCategory } from '../lib/zundaQuotes';

export type ZundaVoiceLine = { file: string; text: string };

const QUOTE_VOICES: Record<ZundaQuoteCategory, ZundaVoiceLine[]> = {
  EARLY_GAME: [
    { file: '/sounds/voice/quotes/EARLY_GAME_0.wav', text: 'ふふん、手牌が育ってきたのだ。今のうちに逃げる準備した方がいいんじゃない？後で泣いても知らないのだ。' },
    { file: '/sounds/voice/quotes/EARLY_GAME_1.wav', text: '僕の配牌、良すぎて笑いが止まらないのだ。君の手牌、なんかゴミ溜めみたいになってない？' },
  ],
  OFFENSE: [
    { file: '/sounds/voice/quotes/OFFENSE_0.wav', text: 'わ、そのリーチ、ブラフでしょ？期待値計算した結果、僕のこの手は全ツッパが最適解と出たのだ。' },
    { file: '/sounds/voice/quotes/OFFENSE_1.wav', text: 'リスクリターンも計算できないの？このドラは通る。いや、通す！君の運だけのリーチなんて怖くないのだ。' },
  ],
  DEFENSE: [
    { file: '/sounds/voice/quotes/DEFENSE_0.wav', text: 'うわ、リーチなのだ。統計的にここは「オリ」が正解なのだ。君のその安そうな手に振り込むほど、僕はバカじゃないのだ。' },
    { file: '/sounds/voice/quotes/DEFENSE_1.wav', text: 'はいはい撤退撤退。君のリーチ、なんかマジ透けて見えるのだ。そんな見え見えの罠にかかるわけないのだ。' },
  ],
  SAFE_TILE: [
    { file: '/sounds/voice/quotes/SAFE_TILE_0.wav', text: 'はいはい、安牌。君のリーチ、全然プレッシャーないんだけどー。' },
    { file: '/sounds/voice/quotes/SAFE_TILE_1.wav', text: 'とりあえず現物っと。ふん、必死な顔してツモってるけど、まさかまだ上がれないのー？' },
  ],
  DRAW_TENPAI: [
    {
      file: '/sounds/voice/quotes/DRAW_TENPAI_0.wav',
      text: '危なかったねー。あと一巡あったら君、飛んでたよ？僕の手、倍満確定だったんだから。命拾いしてよかったね。雑魚運だけはいいのだ。',
    },
  ],
  DRAW_NOTEN: [
    {
      file: '/sounds/voice/quotes/DRAW_NOTEN_0.wav',
      text: 'あえてテンパイを取らなかったのだ。これが「回し打ち」の極意。放銃回避を最優先した高度な戦術。君には理解できない高尚なプレイなのだ。',
    },
  ],
  WIN_SMALL: [
    { file: '/sounds/voice/quotes/WIN_SMALL_0.wav', text: 'はい、ロン。え？安い？点数じゃないのだ。君の「流れ」を断ち切るのが目的なのだ、雑魚。' },
  ],
  WIN_BIG: [
    {
      file: '/sounds/voice/quotes/WIN_BIG_0.wav',
      text: 'これが実力、これが知性なのだ。君の非効率な打牌に対する、統計学からの鉄槌なのだ。点棒置いてさっさと席を立つのだ。',
    },
  ],
  GAME_WIN: [
    {
      file: '/sounds/voice/quotes/GAME_WIN_0.wav',
      text: '当然の結果なのだ。君と僕とでは積んでるCPUのスペックが違いすぎたのだ。悔しかったら課金して出直してくるのだ。まあ、何度やっても僕が勝つけどね。お疲れ様、養分さん。',
    },
  ],
  PLAYER_WIN_LOW: [
    { file: '/sounds/voice/quotes/PLAYER_WIN_LOW_0.wav', text: 'その1000点のために僕の手を蹴ったの？コスパ悪すぎなのだ。' },
    { file: '/sounds/voice/quotes/PLAYER_WIN_LOW_1.wav', text: '必死に鳴いてそれ？駄菓子代にもならないのだｗ' },
  ],
  PLAYER_WIN_HIGH: [
    { file: '/sounds/voice/quotes/PLAYER_WIN_HIGH_0.wav', text: 'はいはい、よかったねー。すごいすごいー。もー、これで満足なのだー？' },
    {
      file: '/sounds/voice/quotes/PLAYER_WIN_HIGH_1.wav',
      text: 'へー、満貫？おめでとうなのだ。まさか、たかがゲームの点数で人生勝った気になってないよねー？',
    },
    {
      file: '/sounds/voice/quotes/PLAYER_WIN_HIGH_2.wav',
      text: 'あーはいはい、強い強い。運だけは一人前なのだ。一応拍手してあげるのだ、パチパチパチ。',
    },
  ],
  PLAYER_WIN_GENERIC: [
    { file: '/sounds/voice/quotes/PLAYER_WIN_GENERIC_0.wav', text: 'はいはいおめでとう。君の人生の運、今ので全部使い果たしたのだｗ' },
    { file: '/sounds/voice/quotes/PLAYER_WIN_GENERIC_1.wav', text: 'まぁ、たまには勝たせてあげないとね。これは「接待」なのだ。' },
  ],
};

export const getZundaVoice = (category: ZundaQuoteCategory): ZundaVoiceLine | null => {
  const lines = QUOTE_VOICES[category];
  if (!lines || !lines.length) return null;
  if (lines.length === 1) return lines[0]!;
  const idx = Math.floor(Math.random() * lines.length);
  return lines[idx] || lines[0]!;
};

