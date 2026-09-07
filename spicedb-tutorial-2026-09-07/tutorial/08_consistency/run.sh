#!/usr/bin/env bash
# 08: ZedToken と consistency 指定を実際に見る。
# 量子化間隔をわざと 8 秒に広げ、「古い答え」が観測できる状況を作る。
set -eu -o pipefail

script_dir=$(
  cd -- "$(dirname -- "$0")" &>/dev/null
  pwd -P
)
project_root=$(
  cd -- "${script_dir}/../.." &>/dev/null
  pwd -P
)

have() { command -v "$1" &>/dev/null; }

if ! have spicedb || ! have zed; then
  if [[ -z ${SPICEDB_TUTORIAL_REEXEC:-} ]] && have nix; then
    export SPICEDB_TUTORIAL_REEXEC=1
    exec nix develop "${project_root}" --command "$0" "$@"
  fi
  echo "spicedb / zed が見つかりません (nix も無いか、devShell に入っても揃いませんでした)。" >&2
  exit 1
fi

grpc_port=${GRPC_PORT:-50062}
endpoint="localhost:${grpc_port}"
key="tutorial-08-key"
log="${script_dir}/spicedb.log"

# --skip-version-check: 版ズレ警告の抑制と、ZedToken を stdout から素で拾うため
zedt() { zed --endpoint "${endpoint}" --token "${key}" --insecure --skip-version-check "$@"; }

show() { printf '\n\033[1;34m$ %s\033[0m\n' "$*"; }
run() {
  show "$@"
  "$@"
}
try() {
  show "$@"
  "$@" || echo "(exit code $?)"
}
note() { printf '\n\033[1;33m# %s\033[0m\n' "$*"; }

# ---- 1. 量子化を粗くしてサーバ起動 ---------------------------------------
note "quantization interval を 8s にして起動 (既定 5s。粗いほど「古い答え」が見えやすい)"
spicedb serve \
  --grpc-preshared-key "${key}" \
  --grpc-addr ":${grpc_port}" \
  --metrics-enabled=false \
  --datastore-revision-quantization-interval 8s \
  --datastore-revision-quantization-max-staleness-percent 0 \
  >"${log}" 2>&1 &
server_pid=$!
trap 'kill "${server_pid}" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  if (exec 3<>"/dev/tcp/127.0.0.1/${grpc_port}") 2>/dev/null; then
    exec 3>&- 3<&- || true
    break
  fi
  sleep 0.2
done

run zedt schema write "${script_dir}/schema.zed"

# ---- 2. 書き込みは ZedToken を返す ----------------------------------------
note "relationship の書き込みは ZedToken (この書き込みを含む revision の印) を返す"
show zedt relationship create document:plan viewer user:bob
token_write=$(zedt relationship create document:plan viewer user:bob)
echo "ZedToken(付与) = ${token_write}"

note "bob の viewer を剥奪する。これも ZedToken が返る"
show zedt relationship delete document:plan viewer user:bob
token_delete=$(zedt relationship delete document:plan viewer user:bob)
echo "ZedToken(剥奪) = ${token_delete}"

# ---- 3. どの時点の世界で評価するかを consistency で選ぶ -------------------
note "at-exactly <付与時token>: 削除前のスナップショットで評価 → まだ true (過去は変わらない)"
try zedt permission check document:plan view user:bob --consistency-at-exactly "${token_write}"

note "at-least <剥奪時token>: 剥奪と同等以上に新しい世界で評価 → 必ず false"
try zedt permission check document:plan view user:bob --consistency-at-least "${token_delete}"

note "指定なし (minimize_latency): 量子化された revision で評価 → 直後は true が返る可能性がある"
try zedt permission check document:plan view user:bob

note "fully-consistent: 常に最新 → false。ただし毎回コストを払う"
try zedt permission check document:plan view user:bob --consistency-full

note "量子化窓 (8s) が過ぎるのを待ってから、もう一度指定なしで"
sleep 9
try zedt permission check document:plan view user:bob

note "おしまい。「剥奪したのに直後の check が true になりうる」のが New Enemy 問題の半分。"
note "アプリは『資源に紐づく ZedToken を保存して at-least で渡す』のが定石 (応用アプリ app/ で実装)"
