import imageCompression from "browser-image-compression";
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
