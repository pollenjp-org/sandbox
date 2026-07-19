import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { compressImage } from "./compress/image";
import {
  compressedName,
  detectKind,
  formatBytes,
  reductionPercent,
} from "./format";
import {
  DEFAULT_SETTINGS,
  type CompressSettings,
  type OutputFormat,
  type WorkItem,
} from "./types";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MAX_DIMENSION_OPTIONS: { label: string; value: number | null }[] = [
  { label: "制限なし", value: null },
  { label: "4000 px", value: 4000 },
  { label: "3000 px", value: 3000 },
  { label: "2000 px", value: 2000 },
  { label: "1600 px", value: 1600 },
  { label: "1200 px", value: 1200 },
  { label: "1000 px", value: 1000 },
];

const OUTPUT_FORMAT_OPTIONS: { label: string; value: OutputFormat }[] = [
  { label: "元の形式を維持", value: "keep" },
  { label: "JPEG", value: "image/jpeg" },
  { label: "WebP", value: "image/webp" },
  { label: "PNG (可逆)", value: "image/png" },
];

const PDF_DPI_OPTIONS: { label: string; value: number }[] = [
  { label: "72 DPI (最小)", value: 72 },
  { label: "96 DPI", value: 96 },
  { label: "120 DPI", value: 120 },
  { label: "144 DPI (標準)", value: 144 },
  { label: "200 DPI", value: 200 },
  { label: "300 DPI (高精細)", value: 300 },
];

export const App = () => {
  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 非同期処理中に最新の設定を参照するための ref。
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // 未クリーンアップの object URL を追跡して確実に revoke する。
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<WorkItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const process = useCallback(
    async (item: WorkItem, current: CompressSettings) => {
      updateItem(item.id, {
        status: "processing",
        progress: 0,
        error: null,
        stale: false,
      });
      try {
        let blob: Blob;
        let outType: string;
        if (item.kind === "image") {
          blob = await compressImage(item.file, current, (p) =>
            updateItem(item.id, { progress: p }),
          );
          outType = blob.type || item.file.type || "image/jpeg";
        } else if (item.kind === "pdf") {
          // pdfjs / pdf-lib は容量が大きいので PDF 処理時のみ読み込む。
          const { compressPdf } = await import("./compress/pdf");
          blob = await compressPdf(item.file, current, (p) =>
            updateItem(item.id, { progress: p }),
          );
          outType = "application/pdf";
        } else {
          throw new Error("対応していないファイル形式です");
        }
        updateItem(item.id, {
          status: "done",
          progress: 1,
          resultBlob: blob,
          resultName: compressedName(item.file.name, outType),
          compressedSize: blob.size,
        });
      } catch (err) {
        updateItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [updateItem],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const newItems: WorkItem[] = files.map((file) => {
        const kind = detectKind(file);
        let previewUrl: string | null = null;
        if (kind === "image") {
          previewUrl = URL.createObjectURL(file);
          previewUrls.current.add(previewUrl);
        }
        return {
          id: makeId(),
          file,
          kind,
          status: kind === "unsupported" ? "error" : "queued",
          progress: 0,
          resultBlob: null,
          resultName: null,
          originalSize: file.size,
          compressedSize: null,
          previewUrl,
          error: kind === "unsupported" ? "対応していないファイル形式です" : null,
          stale: false,
        };
      });

      setItems((prev) => [...prev, ...newItems]);
      for (const it of newItems) {
        if (it.kind !== "unsupported") {
          void process(it, settingsRef.current);
        }
      }
    },
    [process],
  );

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    // 同じファイルを再選択できるように値をリセットする。
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  };

  // クリップボードからの画像貼り付けに対応する。
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const changeSettings = (patch: Partial<CompressSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    // 完了済みの結果は古くなるので stale フラグを立てる。
    setItems((prev) =>
      prev.map((it) => (it.status === "done" ? { ...it, stale: true } : it)),
    );
  };

  const recompressAll = () => {
    for (const it of items) {
      if (it.kind !== "unsupported" && it.status !== "processing") {
        void process(it, settingsRef.current);
      }
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrls.current.delete(target.previewUrl);
      }
      return prev.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    for (const it of items) {
      if (it.previewUrl) {
        URL.revokeObjectURL(it.previewUrl);
        previewUrls.current.delete(it.previewUrl);
      }
    }
    setItems([]);
  };

  const downloadAllZip = async () => {
    const done = items.filter((it) => it.status === "done" && it.resultBlob);
    if (done.length === 0) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const used = new Set<string>();
      for (const it of done) {
        let name = it.resultName ?? it.file.name;
        // ファイル名の重複を避ける。
        if (used.has(name)) {
          const dot = name.lastIndexOf(".");
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          let n = 2;
          while (used.has(`${base}-${n}${ext}`)) n++;
          name = `${base}-${n}${ext}`;
        }
        used.add(name);
        zip.file(name, it.resultBlob as Blob);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, "compressed.zip");
    } finally {
      setZipping(false);
    }
  };

  const stats = useMemo(() => {
    const done = items.filter((it) => it.status === "done");
    const original = done.reduce((sum, it) => sum + it.originalSize, 0);
    const compressed = done.reduce(
      (sum, it) => sum + (it.compressedSize ?? 0),
      0,
    );
    return { count: done.length, original, compressed };
  }, [items]);

  const hasDone = items.some((it) => it.status === "done");
  const hasStale = items.some((it) => it.stale);

  return (
    <div className="app">
      <header className="app-header">
        <h1>画像・PDF 圧縮ツール</h1>
        <p className="lead">
          画像 (PNG / JPEG / WebP など) や PDF をまとめて圧縮します。処理はすべて
          ブラウザ内で完結し、ファイルがサーバーに送信されることはありません。
        </p>
      </header>

      <section className="settings" aria-label="圧縮設定">
        <div className="field">
          <label htmlFor="quality">
            画質 <span className="value">{Math.round(settings.quality * 100)}%</span>
          </label>
          <input
            id="quality"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.quality}
            onChange={(e) =>
              changeSettings({ quality: Number(e.target.value) })
            }
          />
          <span className="hint">JPEG / WebP / PDF ページの品質</span>
        </div>

        <div className="field">
          <label htmlFor="maxDimension">画像の最大辺</label>
          <select
            id="maxDimension"
            value={String(settings.maxDimension)}
            onChange={(e) =>
              changeSettings({
                maxDimension:
                  e.target.value === "null" ? null : Number(e.target.value),
              })
            }
          >
            {MAX_DIMENSION_OPTIONS.map((o) => (
              <option key={o.label} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="hint">大きい画像を縮小</span>
        </div>

        <div className="field">
          <label htmlFor="outputFormat">画像の出力形式</label>
          <select
            id="outputFormat"
            value={settings.outputFormat}
            onChange={(e) =>
              changeSettings({ outputFormat: e.target.value as OutputFormat })
            }
          >
            {OUTPUT_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="hint">WebP は高圧縮</span>
        </div>

        <div className="field">
          <label htmlFor="pdfDpi">PDF の解像度</label>
          <select
            id="pdfDpi"
            value={String(settings.pdfDpi)}
            onChange={(e) => changeSettings({ pdfDpi: Number(e.target.value) })}
          >
            {PDF_DPI_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="hint">各ページを画像化</span>
        </div>
      </section>

      <div
        className={`dropzone${isDragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={onInputChange}
        />
        <p className="dropzone-title">
          ここにファイルをドロップ、またはクリックして選択
        </p>
        <p className="dropzone-sub">
          複数ファイル対応・クリップボードからの貼り付け (Ctrl/Cmd + V) も可能
        </p>
      </div>

      {items.length > 0 && (
        <div className="toolbar">
          <div className="summary">
            {stats.count > 0 ? (
              <>
                <strong>{stats.count} 件</strong> 完了 ·{" "}
                {formatBytes(stats.original)} → {formatBytes(stats.compressed)}{" "}
                <span
                  className={
                    stats.compressed <= stats.original ? "delta-good" : "delta-bad"
                  }
                >
                  ({reductionPercent(stats.original, stats.compressed) >= 0
                    ? "−"
                    : "+"}
                  {Math.abs(
                    reductionPercent(stats.original, stats.compressed),
                  ).toFixed(0)}
                  %)
                </span>
              </>
            ) : (
              <span className="muted">処理中...</span>
            )}
          </div>
          <div className="toolbar-actions">
            {hasStale && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={recompressAll}
              >
                設定を反映して再圧縮
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={downloadAllZip}
              disabled={!hasDone || zipping}
            >
              {zipping ? "ZIP 作成中..." : "ZIP でまとめて保存"}
            </button>
            <button type="button" className="btn" onClick={clearAll}>
              すべて削除
            </button>
          </div>
        </div>
      )}

      <ul className="items">
        {items.map((it) => (
          <li key={it.id} className={`item status-${it.status}`}>
            <div className="thumb">
              {it.previewUrl ? (
                <img src={it.previewUrl} alt={it.file.name} />
              ) : (
                <span className="thumb-icon">
                  {it.kind === "pdf" ? "PDF" : "?"}
                </span>
              )}
            </div>

            <div className="item-body">
              <div className="item-name" title={it.file.name}>
                {it.file.name}
                {it.stale && <span className="badge">要再圧縮</span>}
              </div>

              {it.status === "processing" && (
                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.round(it.progress * 100)}%` }}
                  />
                </div>
              )}

              {it.status === "error" && (
                <div className="item-error">エラー: {it.error}</div>
              )}

              {it.status === "done" && it.compressedSize != null && (
                <div className="item-sizes">
                  {formatBytes(it.originalSize)} →{" "}
                  <strong>{formatBytes(it.compressedSize)}</strong>{" "}
                  <span
                    className={
                      it.compressedSize <= it.originalSize
                        ? "delta-good"
                        : "delta-bad"
                    }
                  >
                    ({reductionPercent(it.originalSize, it.compressedSize) >= 0
                      ? "−"
                      : "+"}
                    {Math.abs(
                      reductionPercent(it.originalSize, it.compressedSize),
                    ).toFixed(0)}
                    %)
                  </span>
                </div>
              )}

              {(it.status === "queued" || it.status === "processing") && (
                <div className="item-sizes muted">
                  {formatBytes(it.originalSize)} · 処理中...
                </div>
              )}
            </div>

            <div className="item-actions">
              {it.status === "done" && it.resultBlob && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    triggerDownload(
                      it.resultBlob as Blob,
                      it.resultName ?? it.file.name,
                    )
                  }
                >
                  保存
                </button>
              )}
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => removeItem(it.id)}
                aria-label="削除"
                title="削除"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      <footer className="app-footer">
        <span>
          すべての処理はブラウザ内で実行されます。PDF は各ページを画像化して
          再構成するため、テキストは選択できなくなります。
        </span>
        <a href="https://github.com/pollenjp-org/sandbox">
          pollenjp-org/sandbox
        </a>
      </footer>
    </div>
  );
};
