#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import requests
from requests.exceptions import ConnectionError, HTTPError, Timeout

VOICEVOX_URL_DEFAULT = os.environ.get("VOICEVOX_URL") or "http://localhost:50021"
SPEAKER = 3  # ずんだもん（ノーマル）

QUOTES: dict[str, list[str]] = {
    "DEFENSE": [
        "うわ、リーチなのだ…。統計的にここは『オリ』が正解なのだ。君のその安そうな手に振り込むほど、ボクは馬鹿じゃないのだ。",
        "はいはい撤退撤退。君のリーチ、なんか『待ち』が透けて見えるのだ。そんな見え見えの罠にかかるわけないのだ。",
    ],
    "OFFENSE": [
        "は？ そのリーチ、ブラフでしょ？ 期待値計算した結果、ボクのこの手は『全ツッパ』が最適解と出たのだ！！",
        "リスクリターンも計算できないの？ このドラは通る……いや、通す！！ 君の運だけのリーチなんて怖くないのだ！！",
    ],
    "SAFE_TILE": [
        "はいはい、安パイ。君のリーチ、全然プレッシャーないんだけど？",
        "はいはい、安全策安全策。そんなにボクのロンが怖いのだ？ ビビり散らかしてるのが手に取るようにわかるのだｗ",
    ],
    "EARLY_GAME": [
        "ふふん、手牌が育ってきたのだ。今のうちに逃げる準備したほうがいいんじゃない？ 後で泣いても知らないのだ。",
        "ボクの配牌、良すぎて笑いが止まらないのだ。君の手牌、なんかゴミ溜めみたいになってない？",
    ],
    "DRAW_TENPAI": [
        "危なかったねー。シミュレーションでは次のツモでボクが上がってたのだ。君の寿命が少し伸びただけなのだ。",
    ],
    "DRAW_NOTEN": [
        "……あえてテンパイを取らなかったのだ。これが『回し打ち』の極意。放銃回避を最優先した高度な戦術……君には理解できない高尚なプレイなのだ。",
    ],
    "WIN_SMALL": [
        "はい、ロン！ ……え、安い？ 点数じゃないのだ、君の『流れ』を断ち切るのが目的なのだ！ ざぁこ♡",
    ],
    "WIN_BIG": [
        "これが実力、これが知性なのだ！！ 君の非効率な打牌に対する、統計学からの鉄槌なのだ！！ 点棒置いてさっさと席を立つのだ！",
    ],
    "GAME_WIN": [
        "当然の結果なのだ。君とボクとでは、積んでるCPUのスペックが違いすぎたのだ。悔しかったら課金して出直してくるのだ！ まあ、何度やってもボクが勝つけどね！ お疲れ様、養分さん！",
    ],
    "PLAYER_WIN_LOW": [
        "えっ、それだけ？ その点数のためにボクの手を蹴ったの？ コスパ悪すぎなのだ。",
        "必死にアガってそれ？ 駄菓子代にもならないのだｗ",
    ],
    "PLAYER_WIN_HIGH": [
        "はいはい、よかったねー。すごいすごい（棒）。これで満足なのだ？",
        "へー、高打点？ おめでとうなのだ。……まさか、たかがゲームの点数で人生勝った気になってないよね？",
        "あーはいはい、強い強い。運だけは一人前なのだ。一応拍手してあげるのだ。（パチパチパチ）",
    ],
    "PLAYER_WIN_GENERIC": [
        "はいはいおめでとう。君の人生の運、今ので全部使い果たしたのだw",
        "まあ、たまには勝たせてあげないとね。これは『接待』なのだ。",
    ],
}

VOICE_PARAMS = {
    "PLAYER_WIN_LOW": {"speedScale": 1.2, "pitchScale": 0.1},
    "PLAYER_WIN_HIGH": {"intonationScale": 0.5, "speedScale": 1.1, "pitchScale": 0.0},
    "PLAYER_WIN_GENERIC": {"speedScale": 1.3, "intonationScale": 1.5},
}


def audio_query(url: str, text: str) -> dict:
    r = requests.post(f"{url}/audio_query", params={"text": text, "speaker": SPEAKER}, timeout=30)
    r.raise_for_status()
    return r.json()


def synthesis(url: str, query: dict) -> bytes:
    r = requests.post(f"{url}/synthesis", params={"speaker": SPEAKER}, json=query, timeout=60)
    r.raise_for_status()
    return r.content


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Zundamon quote voices")
    parser.add_argument("--url", default=VOICEVOX_URL_DEFAULT, help="VOICEVOX base URL")
    parser.add_argument("--out", default="public/sounds/voice/quotes", help="Output dir")
    args = parser.parse_args()

    url = args.url.rstrip("/")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"VOICEVOX: {url} (speaker={SPEAKER})")
    print(f"Output: {out_dir.resolve()}")

    try:
        r = requests.get(f"{url}/version", timeout=10)
        r.raise_for_status()
        print(f"VOICEVOX version: {r.text}")
    except Exception as e:  # noqa: BLE001
        print(f"WARN: version check failed: {e}")

    manifest = {}

    for category, lines in QUOTES.items():
        manifest[category] = []
        for i, line in enumerate(lines):
            filename = f"{category}_{i}.wav"
            out_path = out_dir / filename
            try:
                query = audio_query(url, line)
                tuning = VOICE_PARAMS.get(category)
                if tuning:
                    query.update(tuning)
                wav = synthesis(url, query)
                out_path.write_bytes(wav)
                manifest[category].append(filename)
                print(f"Generated {filename} ({len(wav)} bytes)")
            except (ConnectionError, Timeout, HTTPError) as e:
                print(f"ERROR: failed {category}:{i}: {e}")
                raise

    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Done.")


if __name__ == "__main__":
    main()
