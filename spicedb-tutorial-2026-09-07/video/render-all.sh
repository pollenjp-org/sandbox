#!/usr/bin/env bash
# 台本 (script/script.json) から動画 (out/spicedb-intro.mp4) までを一括生成する。
#   ./render-all.sh            全工程
#   ./render-all.sh --stills   各シーン中央の静止画だけ (QA 用)
set -eu -o pipefail

video_root=$(
  cd -- "$(dirname -- "$0")" &>/dev/null
  pwd -P
)

have() { command -v "$1" &>/dev/null; }

# 道具が無ければ devShell へ入り直す (印を付けて 1 回だけ)
if ! have node || ! have ffmpeg || [[ -z ${CHROMIUM_BIN:-} ]] || [[ -z ${VOICEVOX_ENGINE_BIN:-} ]]; then
  if [[ -z ${VIDEO_REEXEC:-} ]] && have nix; then
    export VIDEO_REEXEC=1
    exec nix develop "${video_root}" --command "$0" "$@"
  fi
  echo "node / ffmpeg / CHROMIUM_BIN / VOICEVOX_ENGINE_BIN が揃いません。nix があれば devShell へ自動で入り直します。" >&2
  exit 1
fi

cd "${video_root}"

echo "==> unit tests"
node --test tools/*.test.mjs >/dev/null
echo "    ok"

echo "==> synth (VOICEVOX)"
node tools/synth.mjs

echo "==> timeline"
node tools/timeline.mjs

echo "==> mix"
node tools/mix.mjs

if [[ ${1:-} == --stills ]]; then
  echo "==> stills (各シーン中央)"
  times=$(node -e '
    const tl = JSON.parse(require("fs").readFileSync("build/timeline.json", "utf8"));
    console.log(tl.scenes.map(s => ((s.startSec + s.endSec) / 2).toFixed(1)).join(","));
  ')
  node tools/render.mjs --stills "${times}"
  exit 0
fi

echo "==> render (フル)"
node tools/render.mjs

echo "==> 検証"
ffprobe -v error -show_entries format=duration -of default=nw=1 out/spicedb-intro.mp4
