#!/usr/bin/env bash
# docshare のデモ。./run.sh が起動している前提で、別ターミナルから実行する。
# 「共有 → 見える / 剥奪 → 直後から見えない」の一連を curl で流す。
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

if ! have curl || ! have jq; then
  if [[ -z ${SPICEDB_TUTORIAL_REEXEC:-} ]] && have nix; then
    export SPICEDB_TUTORIAL_REEXEC=1
    exec nix develop "${project_root}" --command "$0" "$@"
  fi
  echo "curl / jq が見つかりません (nix があれば devShell へ自動で入り直します)。" >&2
  exit 1
fi

base=${DOCSHARE_BASE:-http://localhost:8090}

# req <user> <method> <path> [json body]
# 実行内容・ステータス・整形済みレスポンスを表示する。
req() {
  local user=$1 method=$2 path=$3 body=${4:-}
  printf '\n\033[1;34m$ %s %s%s (X-User: %s)\033[0m\n' "${method}" "${base}" "${path}" "${user:-なし}"
  [[ -n ${body} ]] && printf '  body: %s\n' "${body}"

  local args=(-sS -X "${method}" -w '\n%{http_code}' "${base}${path}")
  [[ -n ${user} ]] && args+=(-H "X-User: ${user}")
  [[ -n ${body} ]] && args+=(-H 'Content-Type: application/json' -d "${body}")

  local out status resp
  out=$(curl "${args[@]}")
  status=$(tail -1 <<<"${out}")
  resp=$(sed '$d' <<<"${out}")
  printf '  -> %s\n' "${status}"
  [[ -n ${resp} ]] && jq --indent 2 . <<<"${resp}" | sed 's/^/  /'
}

note() { printf '\n\033[1;33m# %s\033[0m\n' "$*"; }

note "X-User を付けないと 401 (デモ用の素朴な認証)"
req "" GET /documents/design

note "alice (root の owner) が eng-docs に文書を作る。フォルダの create_document 権限が要る"
req alice POST /folders/eng-docs/documents '{"id":"design","title":"設計メモ","body":"最初の中身"}'

note "carol はフォルダに何の権限も無いので作れない (403)"
req carol POST /folders/eng-docs/documents '{"id":"evil","title":"x","body":""}'

note "bob は eng グループ → フォルダ viewer → 階層の継承、で読める"
req bob GET /documents/design

note "carol には存在ごと隠す (404)"
req carol GET /documents/design

note "bob は view のみ。編集しようとすると 403"
req bob PUT /documents/design '{"title":"横取り","body":"..."}'

note "一覧は LookupResources。bob には design が見え、carol には空"
req bob GET /documents
req carol GET /documents

note "alice が carol に 1 時間の期限付き共有を出す"
expires=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)
req alice POST /documents/design/share "{\"subject\":\"user:carol\",\"role\":\"viewer\",\"expires_at\":\"${expires}\"}"

note "carol が読めるようになった"
req carol GET /documents/design

note "共有を剥奪すると『直後の』リクエストからもう見えない (ZedToken を保存しているから)"
req alice POST /documents/design/unshare '{"subject":"user:carol","role":"viewer"}'
req carol GET /documents/design

note "グループ単位で editor を配ると、メンバーの bob が編集できるようになる"
req alice POST /documents/design/share '{"subject":"group:eng#member","role":"editor"}'
req bob PUT /documents/design '{"title":"設計メモ v2","body":"bob が編集した中身"}'
req bob GET /documents/design

note "おしまい。SpiceDB 側の relationship は zed でも覗ける:"
echo "  zed --endpoint localhost:\${SPICEDB_PORT:-50063} --token docshare-dev-key --insecure relationship read document:design"
