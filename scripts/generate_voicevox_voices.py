#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import socket
import sys
from pathlib import Path

import requests
from requests.exceptions import ConnectionError, HTTPError, Timeout


SPEAKER_ID = 3  # ずんだもん（ノーマル）
def _get_default_gateway_linux() -> str | None:
    try:
        with open("/proc/net/route", "r", encoding="utf-8") as f:
            for line in f.readlines()[1:]:
                fields = line.strip().split()
                if len(fields) < 3:
                    continue
                destination, gateway = fields[1], fields[2]
                if destination != "00000000":
                    continue
                # gateway is little-endian hex
                g = int(gateway, 16)
                ip = socket.inet_ntoa(g.to_bytes(4, byteorder="little"))
                return ip
    except OSError:
        return None
    return None


def _resolve_host_or_none(host: str) -> str | None:
    try:
        socket.gethostbyname(host)
        return host
    except OSError:
        return None


def _default_voicevox_host() -> str:
    env_host = os.environ.get("VOICEVOX_HOST")
    if env_host:
        return env_host
    # Common alias in Docker Desktop / WSL2
    if _resolve_host_or_none("host.docker.internal"):
        return "host.docker.internal"
    # Fallback: Linux default gateway (often the host from container)
    gw = _get_default_gateway_linux()
    if gw:
        return gw
    # Last resort
    return "127.0.0.1"


DEFAULT_VOICEVOX_HOST = _default_voicevox_host()
DEFAULT_VOICEVOX_PORT = os.environ.get("VOICEVOX_PORT") or "50021"
DEFAULT_VOICEVOX_URL = os.environ.get("VOICEVOX_URL") or f"http://{DEFAULT_VOICEVOX_HOST}:{DEFAULT_VOICEVOX_PORT}"
DEFAULT_OUTPUT_DIR = Path("./public/sounds/voice")

LINES: list[tuple[str, str]] = [
    ("zunda_pon.wav", "ポンなのだ！"),
    ("zunda_chi.wav", "チーなのだ。もらうのだ。"),
    ("zunda_kan.wav", "カァーン！"),
    ("zunda_riichi.wav", "リーチなのだ。覚悟するのだ。"),
    ("zunda_ron.wav", "ロン！弱い、弱すぎるのだｗ"),
    ("zunda_tsumo.wav", "ツモ！文句ないのだ！"),
    ("zunda_tenpai.wav", "そろそろ上がれそうなのだ…"),
    ("zunda_slow.wav", "遅いのだ。早く打つのだ。"),
    ("zunda_dora.wav", "おっ、ドラ切ったのだ？"),
    ("zunda_start.wav", "よろしくなのだ。絶対負けないのだ。"),
]


def check_voicevox(url: str) -> None:
    r = requests.get(f"{url}/speakers", timeout=10)
    r.raise_for_status()


def audio_query(url: str, text: str) -> dict:
    r = requests.post(
        f"{url}/audio_query",
        params={"text": text, "speaker": SPEAKER_ID},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def synthesis(url: str, query: dict) -> bytes:
    r = requests.post(
        f"{url}/synthesis",
        params={"speaker": SPEAKER_ID},
        json=query,
        timeout=60,
    )
    r.raise_for_status()
    return r.content


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate VOICEVOX wav assets for zundamahjong.")
    parser.add_argument(
        "--url",
        default=DEFAULT_VOICEVOX_URL,
        help=(
            "VOICEVOX engine URL (default: %(default)s). "
            "You can also set VOICEVOX_HOST/VOICEVOX_PORT or VOICEVOX_URL."
        ),
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Output directory (default: %(default)s)",
    )
    args = parser.parse_args()

    voicevox_url: str = args.url
    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(
        "NOTE: Connection refusedになる場合は、VOICEVOXアプリの設定で『他コンピュータからの接続を許可』する必要があるか、"
        "Windows側のPowerShellから直接このスクリプトを実行してください。",
        file=sys.stderr,
    )
    print(f"VOICEVOX: {voicevox_url} / speaker={SPEAKER_ID}")
    print(f"Output:  {output_dir.resolve()}")

    try:
        check_voicevox(voicevox_url)
    except (ConnectionError, Timeout) as e:
        print("ERROR: Could not connect to VOICEVOX.", file=sys.stderr)
        print(f"  url: {voicevox_url}", file=sys.stderr)
        print("  Please ensure VOICEVOX is running and accessible from this environment.", file=sys.stderr)
        print("  Hint: try setting VOICEVOX_HOST=127.0.0.1 when running on the same machine as VOICEVOX.", file=sys.stderr)
        print(f"  Details: {e}", file=sys.stderr)
        sys.exit(2)
    except HTTPError as e:
        print("ERROR: VOICEVOX responded with an HTTP error during healthcheck.", file=sys.stderr)
        print(f"  Details: {e}", file=sys.stderr)
        sys.exit(3)

    generated = 0
    for filename, text in LINES:
        out_path = output_dir / filename
        try:
            query = audio_query(voicevox_url, text)
            wav = synthesis(voicevox_url, query)
        except (ConnectionError, Timeout, HTTPError) as e:
            print(f"ERROR: Failed to generate {filename}: {e}", file=sys.stderr)
            sys.exit(4)
        out_path.write_bytes(wav)
        generated += 1
        print(f"Generated: {out_path} ({len(wav)} bytes)  text={text}")

    print(f"Done. Generated {generated} files.")


if __name__ == "__main__":
    main()
