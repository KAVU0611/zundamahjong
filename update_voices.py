import requests
import json
import time

host = "localhost"
port = 50021
speaker_id = 3

voices = [
    # Fixed Safe Tile voice (Using Hiragana "あんぜんさく" to prevent misreading)
    {
        "filename": "SAFE_TILE_1.wav",
        "text": "はいはい、あんぜんさく、あんぜんさく。そんなにボクのロンが怖いのだ？ ビビり散らかしてるのが手に取るようにわかるのだわら",
        "speed": 1.2, "pitch": 0.0, "intonation": 1.2
    },
    # New Tsumo voice (Changed "Tsumo" to "Agari" as requested)
    {
        "filename": "WIN_SMALL_TSUMO_0.wav",
        "text": "あがり。安い？ 関係ないのだ。早あがりで君の親番を流すのが、デジタル麻雀の基本なのだ。",
        "speed": 1.1, "pitch": 0.0, "intonation": 1.1
    },
    # New Game Win variations
    {
        "filename": "GAME_WIN_1.wav",
        "text": "圧倒的勝利なのだ！ 人類の知能なんて、所詮この程度なのだ。ボクに勝とうなんて100万年早かったね。",
        "speed": 1.2, "pitch": 0.1, "intonation": 1.3
    },
    {
        "filename": "GAME_WIN_2.wav",
        "text": "対戦ありがとうございましたー。君の打牌データ、いい学習サンプルになったよ。養分になってくれて感謝するのだ。",
        "speed": 1.1, "pitch": 0.0, "intonation": 0.8
    }
]

def generate_wav(voice_data):
    params = (("text", voice_data["text"]), ("speaker", speaker_id))
    q = requests.post(f"http://{host}:{port}/audio_query", params=params).json()
    q["speedScale"] = voice_data["speed"]
    q["pitchScale"] = voice_data["pitch"]
    q["intonationScale"] = voice_data["intonation"]
    res = requests.post(
        f"http://{host}:{port}/synthesis",
        headers={"Content-Type": "application/json"},
        params=params,
        data=json.dumps(q),
    )
    with open(voice_data["filename"], "wb") as f:
        f.write(res.content)
    print(f"Generated: {voice_data['filename']}")
    time.sleep(0.5)

for v in voices:
    generate_wav(v)
