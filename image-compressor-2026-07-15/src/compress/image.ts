import imageCompression from "browser-image-compression";
// browser-image-compression は Web Worker 内でライブラリ本体を importScripts で
// 読み込む。既定では jsDelivr の CDN を参照してしまうため、ライブラリの UMD ビルドを
// 同一オリジンのアセットとしてバンドルし、その URL を libURL で明示する。
// これにより外部への通信を一切行わずに Worker 圧縮を利用できる。
import libURL from "browser-image-compression/dist/browser-image-compression.js?url";
import type { CompressSettings } from "../types";

// 画像を圧縮する。browser-image-compression が Web Worker 上で
// キャンバス経由の再エンコードを行う。
export async function compressImage(
  file: File,
  settings: CompressSettings,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const fileType =
    settings.outputFormat === "keep" ? undefined : settings.outputFormat;

  const result = await imageCompression(file, {
    useWebWorker: true,
    // 外部 CDN ではなく同一オリジンにバンドルしたコピーを Worker から読み込む。
    libURL,
    initialQuality: settings.quality,
    maxWidthOrHeight: settings.maxDimension ?? undefined,
    // 最大辺の指定が無いときは解像度を保ったまま画質のみで圧縮する。
    alwaysKeepResolution: settings.maxDimension == null,
    fileType,
    // ライブラリは 0..100 で進捗を返すので 0..1 に正規化する。
    onProgress: (p) => onProgress?.(p / 100),
  });

  return result;
}
