// Package schema はスキーマ定義ファイル (schema.zed) を Go に埋め込んで提供する。
// アプリ起動時の WriteSchema と、テストのセットアップが同じ実体を使うためのもの。
package schema

import _ "embed"

//go:embed schema.zed
var Schema string
