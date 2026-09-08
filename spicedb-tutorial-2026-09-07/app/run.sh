#!/usr/bin/env bash
# docshare の一括起動:
#   1. spicedb serve (メモリ datastore) を起動
#   2. zed でスキーマ書き込みと seed (フォルダ階層・グループ)
#   3. docshare 本体を起動 (フォアグラウンド。Ctrl-C で spicedb ごと終了)
# 起動後は別ターミナルで ./demo.sh を実行するか、curl で直接叩く。
set -eu -o pipefail

script_dir=$(
  cd -- "$(dirname -- "$0")" &>/dev/null
  pwd -P
)
project_root=$(
  cd -- "${script_dir}/.." &>/dev/null
  pwd -P
)

have() { command -v "$1" &>/dev/null; }

if ! have spicedb || ! have zed || ! have go; then
  if [[ -z ${SPICEDB_TUTORIAL_REEXEC:-} ]] && have nix; then
    export SPICEDB_TUTORIAL_REEXEC=1
    exec nix develop "${project_root}" --command "$0" "$@"
  fi
  echo "spicedb / zed / go が見つかりません (nix があれば devShell へ自動で入り直します)。" >&2
  exit 1
fi

spicedb_port=${SPICEDB_PORT:-50063}
endpoint="localhost:${spicedb_port}"
key=${SPICEDB_PRESHARED_KEY:-docshare-dev-key}
app_addr=${DOCSHARE_ADDR:-:8090}
log="${script_dir}/spicedb.log"

zedt() { zed --endpoint "${endpoint}" --token "${key}" --insecure --skip-version-check "$@"; }

echo "==> spicedb serve を起動 (${endpoint}, log: ${log})"
spicedb serve \
  --grpc-preshared-key "${key}" \
  --grpc-addr ":${spicedb_port}" \
  --metrics-enabled=false \
  >"${log}" 2>&1 &
spicedb_pid=$!
trap 'kill "${spicedb_pid}" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  if (exec 3<>"/dev/tcp/127.0.0.1/${spicedb_port}") 2>/dev/null; then
    exec 3>&- 3<&- || true
    break
  fi
  sleep 0.2
done

echo "==> スキーマ書き込みと seed"
zedt schema write "${script_dir}/schema/schema.zed"
# 世界の初期状態 (認可データだけ。文書はまだ 1 つも無い):
#   root/ (owner: alice) └── eng-docs/ (viewer: eng グループ = {bob})
zedt relationship create folder:root owner user:alice >/dev/null
zedt relationship create folder:eng-docs parent folder:root >/dev/null
zedt relationship create folder:eng-docs viewer group:eng#member >/dev/null
zedt relationship create group:eng member user:bob >/dev/null

# アプリは起動時にスキーマを書き直し、その ZedToken を高水位として取り込む。
# 上の seed はそれより古いので、以後のチェックで必ず見える (08_consistency 参照)。
echo "==> docshare を起動 (${app_addr})"
cd "${script_dir}"
SPICEDB_ENDPOINT="${endpoint}" \
SPICEDB_PRESHARED_KEY="${key}" \
DOCSHARE_ADDR="${app_addr}" \
  go run ./cmd/docshare
