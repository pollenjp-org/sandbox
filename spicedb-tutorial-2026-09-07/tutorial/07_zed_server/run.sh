#!/usr/bin/env bash
# 07: spicedb serve を立てて、zed で schema/relationship/check/lookup を一巡する。
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

# PATH に道具が無ければ devShell へ入り直す (1 回だけ)
if ! have spicedb || ! have zed; then
  if [[ -z ${SPICEDB_TUTORIAL_REEXEC:-} ]] && have nix; then
    export SPICEDB_TUTORIAL_REEXEC=1
    exec nix develop "${project_root}" --command "$0" "$@"
  fi
  echo "spicedb / zed が見つかりません (nix も無いか、devShell に入っても揃いませんでした)。" >&2
  exit 1
fi

grpc_port=${GRPC_PORT:-50061}
endpoint="localhost:${grpc_port}"
key="tutorial-07-key"
log="${script_dir}/spicedb.log"

# --skip-version-check: サーバとの版ズレ警告で出力が埋まるのを防ぐ
zedt() { zed --endpoint "${endpoint}" --token "${key}" --insecure --skip-version-check "$@"; }

# 実行するコマンドを見せながら進める。
# run: 失敗したら止まる / try: 失敗しても続ける (check は「権限なし」で非 0 を返す)
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

# ---- 1. サーバ起動 --------------------------------------------------------
note "spicedb serve をメモリ datastore で起動する (log: ${log})"
spicedb serve \
  --grpc-preshared-key "${key}" \
  --grpc-addr ":${grpc_port}" \
  --metrics-enabled=false \
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

# ---- 2. スキーマ登録 ------------------------------------------------------
note "03_hierarchy のスキーマをそのまま登録する"
run zedt schema write "${script_dir}/../03_hierarchy/schema.zed"
run zedt schema read

# ---- 3. relationship を組み立てる ----------------------------------------
note "フォルダ階層を relationship で組み立てる (03 の validate.yaml と同じ世界)"
run zedt relationship create folder:root owner user:alice
run zedt relationship create folder:projects parent folder:root
run zedt relationship create document:design_doc parent folder:projects
run zedt relationship create document:design_doc viewer user:bob

note "書いた relationship を読む"
run zedt relationship read document:design_doc

# ---- 4. check -------------------------------------------------------------
# 書き込んだ直後の読みなので --consistency-full を明示する。
# 既定 (minimize_latency) は少し古い revision で評価されることがあり、
# 直前の書き込みが見えない場合がある。この話は 08_consistency が主題として扱う。
note "check: alice は arrow 2 段で true / bob は直接 viewer / carol は何も無い"
try zedt permission check document:design_doc view user:alice --consistency-full
try zedt permission check document:design_doc view user:bob --consistency-full
try zedt permission check document:design_doc view user:carol --consistency-full

# ---- 5. explain / lookup ---------------------------------------------------
note "check --explain: 権限がどの経路で解決されたかの木 (デバッグの主力)"
try zedt permission check document:design_doc view user:alice --consistency-full --explain

note "lookup-resources: alice が view できる document の一覧 (一覧画面はこれ)"
try zedt permission lookup-resources document view user:alice --consistency-full

note "lookup-subjects: design_doc を view できる user の一覧 (共有ダイアログはこれ)"
try zedt permission lookup-subjects document:design_doc view user --consistency-full

# ---- 6. 剥奪 --------------------------------------------------------------
note "bob の viewer を消すと check が false に変わる"
run zedt relationship delete document:design_doc viewer user:bob
try zedt permission check document:design_doc view user:bob --consistency-full

note "おしまい。サーバは終了時に落とす (メモリ datastore なのでデータも消える)"
