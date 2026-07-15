// 画像の出力形式。"keep" は元のファイル形式を維持する。
export type OutputFormat = "keep" | "image/jpeg" | "image/webp" | "image/png";

// 圧縮設定。画像と PDF の両方で共有する。
export interface CompressSettings {
  // 画質 (0..1)。JPEG / WebP のエンコード品質、および PDF 各ページのラスタライズ品質に使う。
  quality: number;
  // 画像の最大辺 (px)。null なら縮小しない。
  maxDimension: number | null;
  // 画像の出力形式。
  outputFormat: OutputFormat;
  // PDF ラスタライズ時の解像度 (DPI)。値が大きいほど高精細だがファイルは大きくなる。
  pdfDpi: number;
}

export const DEFAULT_SETTINGS: CompressSettings = {
  quality: 0.7,
  maxDimension: null,
  outputFormat: "keep",
  pdfDpi: 144,
};

export type ItemKind = "image" | "pdf" | "unsupported";

export type ItemStatus = "queued" | "processing" | "done" | "error";

// 1 つのファイルに対する処理状態。
export interface WorkItem {
  id: string;
  file: File;
  kind: ItemKind;
  status: ItemStatus;
  // 進捗 (0..1)。
  progress: number;
  resultBlob: Blob | null;
  resultName: string | null;
  originalSize: number;
  compressedSize: number | null;
  // 画像プレビュー用の object URL。PDF や未対応形式では null。
  previewUrl: string | null;
  error: string | null;
  // 設定変更後、まだ再圧縮していない場合に true。
  stale: boolean;
}
