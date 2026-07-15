# image-compressor

Vite + React で作る、画像・PDF をブラウザ内だけで圧縮するツール。GitHub Pages にデプロイされる。

公開先: https://pollenjp-org.github.io/sandbox/image-compressor-2026-07-15/

## 特徴

- **完全クライアントサイド**: ファイルはサーバーに送信されず、すべてブラウザ内で処理される。
- **画像圧縮** (PNG / JPEG / WebP / GIF / BMP / AVIF など): 画質・最大辺・出力形式を指定して再エンコード。[browser-image-compression](https://github.com/Donaldcwl/browser-image-compression) を使用。
- **PDF 圧縮** (画像入り / スキャン PDF): [pdf.js](https://github.com/mozilla/pdf.js) で各ページを画像化し、JPEG で再エンコードして [pdf-lib](https://github.com/Hopding/pdf-lib) で PDF を再構成する。スキャン画像主体の PDF に特に有効。
- **一括処理**: 複数ファイルをまとめてドロップ / 貼り付け (Ctrl・Cmd + V) でき、ZIP でまとめて保存できる。

## 対応形式

| 種類 | 入力 | 出力 |
| --- | --- | --- |
| 画像 | PNG / JPEG / WebP / GIF / BMP / AVIF / TIFF など | 元の形式維持 / JPEG / WebP / PNG |
| PDF | 任意の PDF | PDF (各ページを画像化して再構成) |

## 注意点

- PDF は各ページをラスタライズ (画像化) して作り直すため、**出力 PDF のテキストは選択・検索できなくなる**。スキャン画像主体の PDF を小さくする用途に向く。
- PNG は可逆形式のため、最大辺を縮小しない限りサイズはあまり減らない。写真は JPEG / WebP への変換を推奨。

## 開発

```sh
npm ci
npm run dev
```

## ビルド

```sh
npm run build
```

GitHub Pages 配下にデプロイする際は `VITE_BASE` を設定する (CI 側で実施)。
