# ADR 003 — 教材解説動画を VOICEVOX + HTML レンダリングで自動生成する

## 背景

この教材 (tutorial 8 章 + textbook 8 章 + docshare) の内容を解説する動画が欲しい。
要件は 3 つ。

1. 音声は VOICEVOX などの機械音声
2. 画面はキャラクターの 2D 画像と解説内容で構成する
3. 解説内容の表示・描画は HTML で行う

一度きりの録画ではなく、**台本を直せば作り直せる**再現可能なパイプラインとして
`video/` に置く。

## 決定

**台本 (JSON) を単一の source of truth にして、
「VOICEVOX ENGINE で音声合成 → HTML ページを headless Chromium で
フレーム単位に決定論的レンダリング → ffmpeg で mux」を全自動で行う。**

```
script/script.json ──┬─> tools/synth.mjs    → build/audio/NNN.wav + NNN.query.json  (VOICEVOX ENGINE)
                     ├─> tools/timeline.mjs → build/timeline.json/.js  (開始時刻・口パク区間・シーン境界)
                     ├─> tools/mix.mjs      → build/full.wav           (無音を挟んで PCM 連結)
page/index.html <────┘        │
     │  window.__seek(t) で任意時刻の画面状態を再現
     └─> tools/render.mjs ────┴─> out/spicedb-intro.mp4   (Chromium CDP で 30fps 撮影 → ffmpeg)
```

### 音声: VOICEVOX ENGINE (nixpkgs)

- 話者は **ずんだもん (解説役)** と **四国めたん (聞き役)** の 2 名の対話形式。
  1 人語りより通説の解説動画形式 (質問→回答) の方が、章をまたぐ長い説明でも
  聞き手の疑問を代弁できる
- `audio_query` が返す **モーラ列 (母音 + 長さ)** をそのまま口パクと字幕の
  タイミング源に使える。これが VOICEVOX を選ぶ決定打
  (単なる TTS だと口パク同期を自前で推定することになる)
- クレジット表記 (`VOICEVOX:ずんだもん` / `VOICEVOX:四国めたん`) を
  エンドカードと video/README.md に入れる

### キャラクター: 自作 SVG マスコット

立ち絵は既存キャラの配布画像を使わず、**オリジナルの SVG マスコット 2 体を自作**する
(スパイス瓶の「ボトル博士」と唐辛子の「チリちゃん」)。

- 配布立ち絵 (坂本アヒル版ずんだもん等) は入手 (BOOTH ログイン) と利用条件の管理が
  自動パイプラインに向かない。自作 SVG なら権利関係が repo 内で完結する
- SVG なのでパーツ (口・目) を id で掴めて、**母音別の口形差し替え・まばたきを
  タイムラインから機械的に駆動できる**

### 画面: 決定論的 seek 方式の単一 HTML

`page/index.html` は `window.__seek(t)` を公開し、**時刻 t を渡すとその瞬間の
画面状態 (スライド・字幕・口形・まばたき・シーン遷移) を完全に再現する**。
CSS アニメーション (壁時計依存) は使わない。

- レンダラは「t を進めながらスクリーンショット」するだけでよく、
  取りこぼし・ドリフトが構造的に起きない (映像と音声は同じ timeline.json から生成)
- 同じ HTML がブラウザで開く**プレビューモード** (実時間再生 + 音声) を兼ねる。
  レンダリング前に人が確認できる

### レンダラ: Chromium CDP 直叩き (npm 依存ゼロ)

Playwright / Puppeteer は使わず、nixpkgs の Chromium を headless で起動して
**CDP (Chrome DevTools Protocol) を Node 24 標準の WebSocket / fetch で直接叩く**。
フレーム PNG は ffmpeg の stdin (image2pipe) へ流し、ディスクに 1 万枚の PNG を
置かない。

- 必要な CDP メソッドは 4 つ (navigate / evaluate / setDeviceMetricsOverride /
  captureScreenshot) で、ライブラリの版管理 (browser とのバージョン整合) が丸ごと消える
- node_modules も package.json も無し。依存はすべて flake.lock が固定する

### 依存: `video/flake.nix` に閉じる

voicevox-engine / chromium / ffmpeg / nodejs / 日本語フォント (fontsConf) を
`video/` 専用の devShell が抱える。script は PATH に無ければ devShell へ
入り直す (repo 既存の作法)。

- voicevox-engine の依存 (voicevox-onnxruntime) が unfree ライセンスのため、
  flake 内で `allowUnfreePredicate` を該当パッケージに限って許可する
- 調査時点の nixpkgs-unstable は `python3.14-pyworld` の
  `ModuleNotFoundError: No module named 'pkg_resources'` で voicevox-engine が
  ビルド不能。**voicevox-engine だけ別チャンネル (安定版) の nixpkgs input から取る**

## 検討して却下した案

| 案 | 却下理由 |
| --- | --- |
| Remotion (React 動画フレームワーク) | npm 依存が大きく、版固定・供給網の管理対象が激増する。要件は「HTML を描いて撮る」だけで、フレームワークの抽象は過剰 |
| Playwright / Puppeteer で撮影 | ブラウザとライブラリの版整合という既知のハマりどころ (pjp-setup-playwright) を、CDP 直叩きなら丸ごと回避できる。録画 API は実時間キャプチャでコマ落ちする |
| CSS アニメーション + 画面録画 (実時間) | 壁時計依存はレンダリング負荷でズレる。決定論的 seek なら何度レンダリングしてもバイト単位で同じ |
| ffmpeg drawtext / concat だけで組む | 字幕だけならできるが、図のアニメーション・キャラ表示・レイアウトは HTML/CSS/SVG の表現力が要る (要件 3 でもある) |
| Open JTalk / edge-tts 等の他 TTS | モーラ単位のタイミング情報を API で返す点、キャラクター声の解説動画文化、nixpkgs にあることの 3 点で VOICEVOX が優位 |
| ずんだもん公式立ち絵の利用 | 上記「キャラクター」の通り。音声はずんだもんを使うが、画像は自作キャラに分離する (VOICEVOX の音声利用は表記のみで足りる) |
| 章ごとに 8 本の動画 | まず 1 本 (約 8 分の総集編) を作る。パイプラインは台本を差し替えるだけで再利用できるので、章別はいつでも足せる |

## 構成 (今回追加)

```
video/
├── README.md            使い方・クレジット・パイプライン解説
├── flake.nix            voicevox-engine / chromium / ffmpeg / nodejs / fonts
├── script/script.json   台本 (シーン・セリフ・話者・スライド指示)
├── page/                描画層 (index.html + page.js + characters.js + slides.js)
├── tools/               synth / timeline / mix / render (.mjs, node:test 付き)
├── render-all.sh        一括実行 (synth → timeline → mix → render)
└── build/, out/         生成物 (gitignore。out/spicedb-intro.mp4 が最終成果物)
```

動画の内容は textbook の流れ (00 if 文の破綻 → 01 ReBAC → 02 スキーマ →
03 Check のグラフ探索 → 04 zed validate → 06 New Enemy 問題と ZedToken →
07 docshare) を 9 シーンに圧縮し、各シーンに対応章のバッジを出して
動画から教材へ誘導する。

## ポイント

- **同期はすべて timeline.json 経由**。音声 (mix) も映像 (render) も同じ
  タイムラインから作るので、a/v ズレが定義上起きない
- 台本の 1 セリフ = 1 wav = 1 字幕 = 1 口パク区間列。セリフ単位で
  再合成・差し替えができる
- 公開する場合は VOICEVOX 利用規約に従いクレジット表記を残すこと
  (動画エンドカードに焼き込み済み)
