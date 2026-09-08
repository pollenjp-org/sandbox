# video — 教材解説動画の生成パイプライン

この教材 (tutorial / textbook / docshare) の内容を約 8 分で駆け抜ける解説動画を、
**台本 JSON から全自動で**生成する。音声は VOICEVOX、画面は HTML を
headless Chromium で決定論的にレンダリングして撮影する (経緯と却下案は
[ADR 003](../docs/adr/003_explainer_video_20260907T195702JST/README.md))。

```sh
./render-all.sh             # 台本 → out/spicedb-intro.mp4 (初回はモデル取得で時間がかかる)
./render-all.sh --stills    # 各シーン中央の静止画だけ build/stills/ へ (確認用)
tail -f build/render.log    # レンダリングの進捗 (フル 1 本で 30〜50 分程度)
```

レンダリング中は一時ファイル (`out/.rendering-*.mp4`) に書き、**完成した瞬間に
`out/spicedb-intro.mp4` へ rename** する。mp4 が out/ に現れたら、それは開ける。

## 仕組み

```
script/script.json ──┬─> tools/synth.mjs    → build/audio/NNN.wav + NNN.query.json  (VOICEVOX ENGINE)
     (台本 = 正)     ├─> tools/timeline.mjs → build/timeline.json/.js  (開始時刻・口パク・シーン境界)
                     ├─> tools/mix.mjs      → build/full.wav           (無音を挟んで PCM 連結)
page/index.html <────┘        │
     │  window.__seek(t) が時刻 t の画面状態を完全に決める (CSS アニメ・乱数・壁時計は不使用)
     └─> tools/render.mjs ────┴─> out/spicedb-intro.mp4   (CDP で 30fps 撮影 → ffmpeg)
```

- **同期はすべて `build/timeline.json` 経由。** 音声 (mix) も映像 (render) も
  同じタイムラインから作るので、a/v ズレは構造的に起きない
- 口パクは `audio_query` が返すモーラ列 (母音 + 長さ) から作る
- 台本の 1 セリフ = 1 wav。テキストを直したセリフだけ再合成される (`NNN.meta.json`)

## プレビュー (レンダリングせずに確認)

`./render-all.sh --stills` まで済んでいれば `build/timeline.js` と `build/full.wav` が
あるので、`page/index.html` をブラウザで開くと音声付きで再生・シークできる。
`build/` が無い状態で開くと、台本なしの静的プレビュー (step を順に出すだけ) になる。

## 部分レンダリング

```sh
nix develop . --command node tools/render.mjs --range 60 90     # 60〜90 秒だけ out/preview.mp4
nix develop . --command node tools/render.mjs --stills 12,34.5  # 指定秒の PNG
```

## 台本の直し方

`script/script.json` の cue を編集する。

| フィールド | 意味 |
| --- | --- |
| `speaker` | `zunda` (ボトル博士) / `metan` (チリちゃん) |
| `text` | 合成するテキスト。**読み間違いはカタカナで直す** (SpiceDB → スパイスディービー) |
| `caption` | 画面の字幕 (省略時 text)。こちらは正しい表記で書く |
| `step` | このセリフ開始で出すスライド要素 (`page/slides.js` の `data-step` と対応) |
| `pauseAfter` | このセリフ後の追加の間 (秒) |

スライドの見た目は `page/slides.js` / `page/index.html` (CSS)、
キャラクターは `page/characters.js`。

## クレジット / 利用上の注意

- 音声: **VOICEVOX:ずんだもん / VOICEVOX:四国めたん**。
  動画を公開する場合は [VOICEVOX 利用規約](https://voicevox.hiroshiba.jp/term/) と
  各キャラクターの利用規約に従い、クレジット表記を残すこと
  (エンドカードに焼き込み済み。動画説明欄にも書くのが丁寧)
- キャラクター画像 (ボトル博士 / チリちゃん) はこの repo で描いたオリジナル SVG
- 依存 (voicevox-engine / chromium / ffmpeg / node) はすべて `flake.nix` が抱える。
  voicevox-engine は unstable の python3.14 で壊れているため nixos-26.05 の
  revision を直接 pin している (flake.nix のコメント参照)
