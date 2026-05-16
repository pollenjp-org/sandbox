# github-ci-environment-script-2026-05-16

GitHub CI 環境を Claude Code on the web の SessionStart hook として登録するタスク。

実際のファイルは repository root に配置されている (Claude Code が `.claude/` を repo root から読み込むため。`.github/` と同じ CI/CD 例外):

- `/.claude/hooks/session-start.sh` — `CLAUDE_CODE_REMOTE=true` の時に CI と同じ npm 依存を install する
- `/.claude/settings.json` — 上記スクリプトを `SessionStart` hook として登録

対象プロジェクト (`.github/workflows/static.yml` の `npm ci` を踏襲):

- `book-mindmap-explorer-2026-05-03/`
- `html-text-extractor-2026-05-04/`

## ローカルでの実行

```bash
chmod +x .claude/hooks/session-start.sh
CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
```
