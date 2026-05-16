#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Mirrors the .github/workflows/static.yml CI environment so tests, linters,
# and builds for the npm projects work inside web sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

install_npm_project() {
  local dir="$1"
  if [ ! -f "${repo_root}/${dir}/package.json" ]; then
    echo "Skipping ${dir}: no package.json"
    return 0
  fi
  echo "Installing npm deps in ${dir}"
  (cd "${repo_root}/${dir}" && npm install --no-audit --no-fund --loglevel=error)
}

install_npm_project "book-mindmap-explorer-2026-05-03"
install_npm_project "html-text-extractor-2026-05-04"

echo "SessionStart hook complete."
