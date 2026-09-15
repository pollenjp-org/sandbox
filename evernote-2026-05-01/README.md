# evernote-2026-05-01

Evernote の `.enex` エクスポートを Notion データベースへ移行するツール。
Notion 公式インポートでは失われてしまう **元の Evernote GUID** や **作成・更新日時、ソース URL、リマインダー、ジオ情報、ノートブック由来の情報** をすべてデータベースの列として保存することを目的としている。

## 何が嬉しいか

公式インポーターは Evernote 内部の GUID を保存しないため、後から「Evernote 上のあのノート ＝ Notion のこのページ」という対応が取れない。
このツールでは以下のように Evernote GUID を含めた列で Notion DB を構築し、再実行時には GUID で重複を検知してスキップする。

| 列名 | 型 | 内容 |
| --- | --- | --- |
| Title | title | ノートタイトル |
| Evernote GUID | rich_text | Evernote の GUID（取れない時は `sha1:...` の決定論的 ID） |
| Evernote GUID Source | select | GUID の取得元（`source-url` / `application-data` / `sha1-fallback` / `missing`） |
| Source URL | url | `evernote://...` などの元 URL |
| Source / Source Application / Author | rich_text | 各 Evernote 属性 |
| Created / Updated | date | Evernote 上の作成・更新日時 |
| Tags | multi_select | タグ |
| Reminder / Reminder Done | date | リマインダー |
| Latitude / Longitude / Altitude | number | ジオ情報 |
| Source File | rich_text | 元 `.enex` ファイル名 |
| Migrated At | date | 移行実行時刻 |
| Migration Status | select | Success / Partial / Failed |

## Evernote GUID の取得元

ENEX フォーマット自体には GUID 専用フィールドは無いが、以下の場所から復元できる:

1. `<note-attributes><source-url>` の `evernote:///view/<userId>/<shardId>/<GUID>/<GUID>/`
2. `<note-attributes><application-data key="evernote.guid">...</application-data>` などのキー
3. 上記いずれも無い場合は `title|created|content[:512]` の SHA-1 を `sha1:...` として保存（決定論的なので再実行で同じ ID になる）

このため Evernote 公式アプリでエクスポートしたファイルはほぼ確実に GUID を保存できる。

## セットアップ

```bash
# 1. mise で uv を入れる
mise install

# 2. .env を準備
cp .env.example .env
# .env を編集して NOTION_TOKEN, NOTION_PARENT_PAGE_ID を設定

# 3. 依存解決
uv sync
```

Notion 側の準備:

1. <https://www.notion.so/my-integrations> で internal integration を作って `secret_...` トークンを取得
2. データベースの親になるページを作り、そのページの右上「...」→ Connections から作った integration を接続
3. ページ URL の末尾の 32 桁 (`https://www.notion.so/Some-Page-<32hex>`) が `NOTION_PARENT_PAGE_ID`

## 使い方

```bash
# まずは dry-run でパース結果（GUID が取れているか）を確認
uv run python migrate.py path/to/notes.enex --dry-run --limit 3

# 本番実行
uv run python migrate.py path/to/notes.enex

# 既存 DB を再利用したいなら .env に NOTION_DATABASE_ID を入れて実行
NOTION_DATABASE_ID=xxxxx uv run python migrate.py path/to/notes.enex

# 複数ファイルもまとめて
uv run python migrate.py exports/*.enex
```

`mise` タスク経由でも:

```bash
mise run migrate -- path/to/notes.enex
mise run test
```

## 仕組み

| ファイル | 役割 |
| --- | --- |
| `enex_parser.py` | `.enex` をストリーム解析し `Note` データクラスに変換。GUID 復元はここ |
| `enml_converter.py` | ENML (Evernote の HTML 方言) を Notion の block JSON に変換 |
| `notion_migrator.py` | Notion DB の作成・スキーマ定義・ページ作成・重複検知 |
| `migrate.py` | CLI |

## 制限事項

- `<en-media>` で参照されている **添付ファイル** は Notion API 仕様上、外部 URL からしか取り込めないため、現状は callout ブロックで「添付があった事実」と MIME / hash を残すに留めている。必要なら別途 S3 等にアップロードしてその URL を埋め込むよう拡張する。
- ENML のテーブルはプレーンテキスト化している（Notion の table block は構造が複雑なため）。
- Notion の rich_text は 1 セグメント 2000 文字までなのでチャンク分割している。

## テスト

```bash
uv run pytest -v
```

サンプル `.enex` を `tests/sample.enex` に同梱しているので、Notion トークンが無い環境でもパーサと ENML 変換は確認できる。
