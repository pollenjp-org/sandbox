# SpiceDB 教材解説動画パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教材 (spicedb-tutorial-2026-09-07) の解説動画 mp4 を、台本 JSON から VOICEVOX 音声 + HTML 決定論的レンダリングで全自動生成するパイプライン `video/` を作る。

**Architecture:** script.json (単一 source of truth) → synth (VOICEVOX ENGINE, wav + モーラ timing) → timeline (開始時刻・口パク) → mix (PCM 連結で full.wav) → render (headless Chromium CDP で `__seek(t)` を 30fps 撮影 → ffmpeg mux)。詳細と却下案は Spec 参照。

**Tech Stack:** nix flake (voicevox-engine / chromium / ffmpeg / nodejs_24 / noto CJK), Node 標準ライブラリのみ (npm 依存ゼロ), node:test。

**Spec:** `spicedb-tutorial-2026-09-07/docs/adr/003_explainer_video_20260907T195702JST/README.md`

## Global Constraints

- 作業ディレクトリ: `spicedb-tutorial-2026-09-07/video/` (以下パスはここ基準)
- 動画仕様: 1920x1080, 30fps, H.264 (crf 18) + AAC 192k, `out/spicedb-intro.mp4`
- 音声仕様: VOICEVOX 出力 24000Hz/16bit/mono を無変換で連結 (mix)、最終 mux で AAC 化
- 話者: `zunda` = ずんだもん(ノーマル) 解説役, `metan` = 四国めたん(ノーマル) 聞き役。style id は /speakers から名前で解決 (ハードコードしない)
- npm 依存ゼロ。`node:` 標準モジュールと fetch / WebSocket (Node 24 内蔵) のみ
- CSS transition/animation 禁止。画面状態はすべて `__seek(t)` の純関数
- タイミング定数: LEAD_IN=0.6s (冒頭無音), GAP=0.35s (セリフ間), SCENE_GAP=1.0s (シーン跨ぎのセリフ間), TAIL=3.0s (最終カットのホールド), FPS=30
- flake.lock は `nix run 'github:pollenjp/dotfiles?dir=nix#flake-lock-age' -- update` で生成 (素の `nix flake update` 禁止)。`git add flake.nix` を nix コマンドより先に
- クレジット表記 `VOICEVOX:ずんだもん` `VOICEVOX:四国めたん` をエンドカードと README に必ず入れる
- 生成物は commit しない: `video/.gitignore` に `build/` `out/`

---

### Task 1: scaffold + flake + devShell 検証

**Files:**
- Create: `video/flake.nix`, `video/.gitignore`, `video/tools/.gitkeep` 相当 (ディレクトリは後続タスクのファイルが作る)

**Interfaces:**
- Produces: devShell 環境変数 `CHROMIUM_BIN`, `FONTCONFIG_FILE`, `VOICEVOX_ENGINE_BIN`。後続の全 script がこれを前提にする

- [ ] **Step 1: voicevox-engine が nixos-26.05 でビルドできるか確認** (バックグラウンドで実行中の probe の結果を見る)。ダメなら nixos-25.11 → pyworld overlay の順にフォールバック
- [ ] **Step 2: flake.nix を書く** — inputs: `nixpkgs` (nixpkgs-unstable; chromium/ffmpeg/nodejs_24/fonts) + `nixpkgs-voicevox` (Step 1 で通ったチャンネル)。`import nixpkgs-voicevox { config.allowUnfreePredicate = p: (lib.getName p) が ["voicevox-engine" "voicevox-core" "voicevox-onnxruntime" "voicevox-models" "voicevox-resource"] に含まれる; }`。`fontsConf = pkgs.makeFontsConf { fontDirectories = [ noto-fonts-cjk-sans noto-fonts-color-emoji liberation_ttf ]; }`。shellHook で `CHROMIUM_BIN` / `FONTCONFIG_FILE` / `VOICEVOX_ENGINE_BIN` を export。systems は linux 2 種のみ (chromium が darwin 非対応)
- [ ] **Step 3: `git add video/flake.nix` してから flake-lock-age update** (閉包スキャンの表に目を通す)。`git add video/flake.lock`
- [ ] **Step 4: devShell 検証**: `nix develop ./video --command bash -c '"$CHROMIUM_BIN" --version && ffmpeg -version | head -1 && node --version && "$VOICEVOX_ENGINE_BIN" --help | head -3 && fc-list :lang=ja | wc -l'` — chromium/ffmpeg/node が動き、fc-list が 1 以上
- [ ] **Step 5: Commit** `feat(video): 動画生成パイプラインの devShell (voicevox-engine/chromium/ffmpeg)`

### Task 2: wav.mjs — WAV 読み書き (TDD)

**Files:**
- Create: `video/tools/wav.mjs`, `video/tools/wav.test.mjs`

**Interfaces:**
- Produces:
  - `parseWav(buf: Buffer) -> { sampleRate, channels, bitsPerSample, pcm: Int16Array, durationSec }` (fmt/data チャンク走査。PCM16 mono 以外は throw)
  - `buildWav(pcm: Int16Array, sampleRate: number) -> Buffer`
  - `silenceSamples(sec: number, sampleRate: number) -> number` (丸めは Math.round)

- [ ] **Step 1: 失敗するテストを書く** — `buildWav` で 24000Hz/0.5s の正弦波を作り `parseWav` で往復して sampleRate/durationSec/pcm 長が一致すること、44byte ヘッダ以外に junk チャンク (`LIST`) を挟んだ wav も parse できること、stereo wav は throw すること
- [ ] **Step 2: `node --test tools/` で FAIL を確認**
- [ ] **Step 3: 実装** (RIFF 走査: offset 12 から chunkId/chunkSize を読み進める)
- [ ] **Step 4: PASS を確認**
- [ ] **Step 5: Commit** `feat(video): wav 読み書きヘルパ`

### Task 3: timeline.mjs — タイムライン構築 (TDD)

**Files:**
- Create: `video/tools/timeline.mjs`, `video/tools/timeline.test.mjs`

**Interfaces:**
- Consumes: script.json スキーマ (Task 5 と共有):
  ```json
  { "title": "...", "scenes": [ { "id": "op", "cues": [
      { "speaker": "zunda", "text": "合成するテキスト", "caption": "字幕(省略時 text)",
        "step": "スライド内で発火させる data-step 名 (省略可)", "pauseAfter": 0.6 } ] } ] }
  ```
- Consumes: `parseWav` (Task 2)
- Produces: `buildTimeline(script, cueData) -> timeline` 純関数。`cueData[i] = { wavSec: number, query: audio_query オブジェクト }` (flatten 順)
- Produces: timeline スキーマ (page / mix / render が読む):
  ```json
  { "fps": 30, "sampleRate": 24000, "totalSec": 0.0,
    "scenes": [ { "id": "op", "startSec": 0, "endSec": 0 } ],
    "cues": [ { "i": 0, "scene": "op", "speaker": "zunda", "caption": "...",
                 "step": "...", "startSec": 0.6, "endSec": 3.2,
                 "mouth": [[絶対開始秒, 絶対終了秒, "a|i|u|e|o|n"], ...] } ] }
  ```
- Produces: CLI `node tools/timeline.mjs` — `script/script.json` + `build/audio/NNN.{wav,query.json}` を読み `build/timeline.json` と `build/timeline.js` (`window.TIMELINE = {...};`) を書く
- 口パク規則: offset は `query.prePhonemeLength`。accent_phrases[].moras[] の (consonant_length||0)+vowel_length を積算し、vowel を小文字化して `a/i/u/e/o` はそのまま、`n/cl/pau` 系は間引き (interval を作らない)。pause_mora も長さだけ積算
- 開始時刻規則: cue0 = LEAD_IN。以後 前 cue の end + GAP (シーンが変わる場合 SCENE_GAP)。cue の `pauseAfter` があれば GAP に加算。totalSec = 最終 end + TAIL。scene.startSec = 最初の cue の startSec - 0.5 (scene0 は 0)、endSec = 次 scene の startSec (最終は totalSec)
- バリデーション: speaker が zunda/metan 以外、scenes 空、cue.text 空 → throw

- [ ] **Step 1: 失敗するテストを書く** — 合成 query (prePhonemeLength=0.1, モーラ2個: {consonant_length:0.05, vowel:"a", vowel_length:0.15}, {vowel:"N", vowel_length:0.1}) で mouth が `[[start+0.1, start+0.3, "a"]]` になること (N は捨てる)、2 シーン 3 cue で GAP/SCENE_GAP/totalSec が定数通りになること、無効 speaker で throw
- [ ] **Step 2: FAIL 確認** → **Step 3: 実装** → **Step 4: PASS 確認**
- [ ] **Step 5: Commit** `feat(video): 台本+音声からタイムラインを構築`

### Task 4: synth.mjs — VOICEVOX 合成

**Files:**
- Create: `video/tools/synth.mjs`, `video/tools/engine.mjs`

**Interfaces:**
- Consumes: `VOICEVOX_ENGINE_BIN` (Task 1), script.json (Task 3 のスキーマ)
- Produces: `build/audio/NNN.wav` + `build/audio/NNN.query.json` (NNN = flatten 順 0 埋め 3 桁)。`NNN.meta.json` に `{ hash }` (speaker+text の sha256) を置き、変更が無ければスキップ
- Produces (engine.mjs): `startEngine() -> { baseUrl, stop() }` (空きポートで spawn、/version を最大 60s ポーリング)、`resolveStyleId(baseUrl, speakerName, styleName) -> number`

- [ ] **Step 1: engine.mjs + synth.mjs を実装** — flatten cues → 各 cue: `POST {base}/audio_query?speaker={id}&text=...` → query JSON 保存 → `POST {base}/synthesis?speaker={id}` (body=query) → wav 保存。逐次でよい (数十 ms/件 ではないが全 90 cue で数分想定)
- [ ] **Step 2: スモーク** — 2 cue だけの一時 script で実行し、wav の durationSec > 0.3 と query.accent_phrases 非空を assert するワンライナーで確認
- [ ] **Step 3: Commit** `feat(video): VOICEVOX ENGINE で台本を一括合成`

### Task 5: script.json — 台本

**Files:**
- Create: `video/script/script.json`

**Interfaces:**
- Consumes: Task 3 のスキーマ。scene id は次の 9 個に固定: `op, ifhell, zanzibar, rebac, schema, check, zed, newenemy, outro`
- Produces: 各 cue の `step` 名。page (Task 6) の data-step と 1:1 対応させるため、この台本の step 一覧が slides.js の仕様になる

- [ ] **Step 1: 台本を書く** — textbook 00→07 の流れ (Spec の「構成」参照)。制約: 総再生 7.5〜9 分 (≒ 発話合計 6.5〜8 分)、1 cue ≦ 80 文字目安、対話形式 (metan が疑問を出し zunda が答える)、各シーン冒頭 cue に章バッジ step、outro に教材の歩き方 + クレジット読み上げ (「音声はボイスボックス、ずんだもんと四国めたんを使用しています」)
- [ ] **Step 2: 検証** — `node tools/timeline.mjs` はまだ音声が無いので、`node -e` で JSON parse + scene id/speaker のバリデーション関数 (timeline.mjs から import) を通す
- [ ] **Step 3: Commit** `feat(video): 解説台本 (9 シーン)`

### Task 6: page/ — 描画層

**Files:**
- Create: `video/page/index.html`, `video/page/page.js`, `video/page/characters.js`, `video/page/slides.js`

**Interfaces:**
- Consumes: `../build/timeline.js` (`window.TIMELINE`)、preview 用 `../build/full.wav`
- Produces: `window.__seek(tSec)` (同期・冪等)、`window.__ready` (Promise、フォントロード完了)、`window.__total()` (totalSec)。URL `?render=1` で preview UI (再生ボタン・シークバー) を隠す
- characters.js: `CHARACTERS = { zunda: {name, svg, mouthShapes}, metan: {...} }`。SVG は `<g data-mouth="closed|a|i|o">` 4 口形 + `<g data-eyes="open|closed">`。zunda 側キャラ=ボトル博士 (スパイス瓶)、metan 側=チリちゃん (唐辛子) ※自作。まばたきは t の決定論的関数
- slides.js: `SLIDES[sceneId] = { html }`。`data-step="名前"` 要素は該当 cue の startSec 以降 (0.25s フェード) で出現。シーン切替は 0.5s クロスフェード。図は inline SVG (check のグラフ探索は step ごとに辺をハイライト、newenemy は時系列図)

- [ ] **Step 1: frontend-design skill を読み、ビジュアル方針を決めてから書く** (1080p 前提: 本文 ≥28px、ダーク基調 + スパイス系アクセント)
- [ ] **Step 2: characters.js / slides.js / page.js / index.html を実装**
- [ ] **Step 3: 静的検証** — timeline 生成前でもダミー TIMELINE でエラーなく `__seek(0)` できること (`node --experimental-... 不要。chromium ヘッドレスで --dump-dom` か Task 7 の stills で確認でもよい)
- [ ] **Step 4: Commit** `feat(video): 描画層 (キャラ/スライド/決定論的 seek)`

### Task 7: render.mjs — 撮影と mux

**Files:**
- Create: `video/tools/render.mjs`

**Interfaces:**
- Consumes: `CHROMIUM_BIN`, `FONTCONFIG_FILE`, `build/timeline.json`, `build/full.wav`, page (`__seek`/`__ready`)
- Produces: `out/spicedb-intro.mp4`。オプション `--stills t1,t2,...` (build/stills/tNNN.png に PNG 書き出し、QA 用)、`--range a b` (部分レンダリング、frames を out に直接)

- [ ] **Step 1: 実装** — chromium 起動 flags: `--headless=new --remote-debugging-port=<空きポート> --hide-scrollbars --mute-audio --force-color-profile=srgb --disable-lcd-text --allow-file-access-from-files --user-data-dir=<一時dir>`。`/json/version` → `/json/list` で page target の webSocketDebuggerUrl → WebSocket で CDP: `Emulation.setDeviceMetricsOverride {1920,1080,dsf:1}` → `Page.navigate(file://.../index.html?render=1)` → `Runtime.evaluate awaitPromise __ready` → 各フレーム `Runtime.evaluate __seek(i/30)` + `Page.captureScreenshot {format:"png"}` → ffmpeg 子プロセス stdin (`-f image2pipe -framerate 30 -i - -i build/full.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart out/spicedb-intro.mp4`)
- [ ] **Step 2: stills で QA** — 各シーン中央時刻の PNG を出し、目視 (Read) で 豆腐/レイアウト崩れ/口パク描画を確認。崩れは page 側を直す
- [ ] **Step 3: Commit** `feat(video): CDP フレーム撮影と ffmpeg mux`

### Task 8: mix.mjs — 音声ミックス (TDD)

**Files:**
- Create: `video/tools/mix.mjs`, `video/tools/mix.test.mjs`

**Interfaces:**
- Consumes: `build/timeline.json`, `build/audio/NNN.wav`, wav.mjs
- Produces: `build/full.wav` (24000Hz/16bit/mono, 長さ = round(totalSec*24000) サンプル)。`mixPcm(timeline, pcms: Int16Array[]) -> Int16Array` は純関数

- [ ] **Step 1: 失敗するテスト** — cue2 個 (start 0.5/2.0, 各 0.5s 相当の PCM) で、出力長 = totalSec*sr、無音区間が 0、cue 区間が元 PCM と一致
- [ ] **Step 2: FAIL** → **Step 3: 実装 (set で配置)** → **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(video): タイムライン通りに音声を 1 本へ`

### Task 9: 一括実行 + README + 全体検証

**Files:**
- Create: `video/render-all.sh`, `video/README.md`
- Modify: `spicedb-tutorial-2026-09-07/README.md` (構成表に video/ の行)

**Interfaces:**
- Consumes: 全タスク
- Produces: `./render-all.sh` 一発で script.json → mp4 (devShell 自動入り直し、REEXEC ガード付き)

- [ ] **Step 1: render-all.sh** — synth → timeline → mix → render を順に。`node --test tools/` も先頭で回す
- [ ] **Step 2: フルレンダリング実行**
- [ ] **Step 3: 検証 (verification-before-completion)** — `ffprobe out/spicedb-intro.mp4`: duration ≒ timeline.totalSec (±0.2s)、video 1920x1080 30fps、audio aac。mp4 から数フレーム抽出して目視。`node --test` 全緑
- [ ] **Step 4: README.md** — 使い方 (render-all.sh / プレビュー / 部分レンダリング)、クレジットと利用規約注意、パイプライン図
- [ ] **Step 5: Commit** `feat(video): 一括実行と README`

## Self-Review

- Spec coverage: 音声(VOICEVOX)=Task 4、キャラ 2D=Task 6 characters.js、HTML 画面=Task 6、自動生成=Task 7-9、依存の flake 閉じ込め=Task 1、クレジット=Task 5/9 — 全要件にタスクあり
- Placeholder: なし (創作物 [台本/キャラ/スライド] は受け入れ制約で規定)
- 型整合: parseWav/buildTimeline/mixPcm/TIMELINE スキーマは Interfaces 節で統一済み。mix (Task 8) は timeline.json (Task 3) にのみ依存し、render (Task 7) より先でも後でもよい — 実行順は 1→2→3→4→5→8→6→7→9 とする (mix を先に済ませると page プレビューで音が出る)
