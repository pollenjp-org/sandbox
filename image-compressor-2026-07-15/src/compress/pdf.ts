import * as pdfjsLib from "pdfjs-dist";
// Vite が worker を base 付きのアセットとして出力するように ?url で取り込む。
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument } from "pdf-lib";
import type { CompressSettings } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// PDF の基準解像度は 72 DPI (1pt = 1px)。設定 DPI からスケール倍率を求める。
const PDF_BASE_DPI = 72;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("キャンバスの画像化に失敗しました")),
      type,
      quality,
    );
  });
}

// PDF の各ページを画像としてラスタライズし、JPEG で再エンコードして
// 新しい PDF に組み直すことでファイルサイズを削減する。
// スキャン画像主体の PDF に特に有効。テキストは画像化されるため選択不可になる。
export async function compressPdf(
  file: File,
  settings: CompressSettings,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const scale = settings.pdfDpi / PDF_BASE_DPI;

  try {
    const outDoc = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D コンテキストを取得できませんでした");

      // JPEG は透過を持てないため白で塗りつぶしておく。
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", settings.quality);
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const embedded = await outDoc.embedJpg(jpegBytes);

      // 出力ページは元の物理サイズ (pt) を保つ。
      const baseViewport = page.getViewport({ scale: 1 });
      const outPage = outDoc.addPage([baseViewport.width, baseViewport.height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });

      // メモリ解放。
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      onProgress?.(pageNum / pdf.numPages);
    }

    const bytes = await outDoc.save();
    return new Blob([bytes], { type: "application/pdf" });
  } finally {
    await pdf.destroy();
  }
}
