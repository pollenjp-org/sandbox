#!/usr/bin/env bash
# チュートリアル全章の zed validate と、応用アプリ (app/) の go vet / go test を
# まとめて回す。CI 相当の一括検証。
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

if ! have zed || ! have go || ! have spicedb; then
  if [[ -z ${SPICEDB_TUTORIAL_REEXEC:-} ]] && have nix; then
    export SPICEDB_TUTORIAL_REEXEC=1
    exec nix develop "${project_root}" --command "$0" "$@"
  fi
  echo "zed / go / spicedb が見つかりません (nix も無いか、devShell に入っても揃いませんでした)。" >&2
  exit 1
fi

cd "${project_root}"

echo "==> zed validate (tutorial + app schema)"
for f in tutorial/*/validate.yaml app/schema/validate.yaml; do
  [[ -e ${f} ]] || continue
  printf '  %-42s ' "${f}"
  zed validate "${f}"
done

if [[ -d app ]]; then
  echo "==> go vet (app)"
  (cd app && go vet ./...)
  echo "==> go test (app)  ※ spicedb serve-testing を子プロセスで起動する"
  (cd app && go test ./...)
fi

echo "==> all green"
