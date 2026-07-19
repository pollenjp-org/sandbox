import type { ItemKind } from "./types";

// バイト数を人が読みやすい単位に整形する。
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  const digits = i === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[i]}`;
}

// 圧縮率 (%)。正の値なら小さくなったことを表す。
export function reductionPercent(original: number, compressed: number): number {
  if (original <= 0) return 0;
  return (1 - compressed / original) * 100;
}

// MIME タイプから拡張子を導出する。
export function extensionForType(type: string): string {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

// 元のファイル名から圧縮後のファイル名を作る (例: photo.png -> photo-compressed.jpg)。
export function compressedName(originalName: string, outputType: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}-compressed.${extensionForType(outputType)}`;
}

// ファイルの種類を判定する。MIME タイプを優先し、なければ拡張子で推定する。
export function detectKind(file: File): ItemKind {
  const type = file.type;
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (type.startsWith("image/")) return "image";
  if (/\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(file.name)) return "image";
  return "unsupported";
}
