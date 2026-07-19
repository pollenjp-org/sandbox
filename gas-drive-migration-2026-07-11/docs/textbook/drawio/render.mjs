/**
 * .drawio (mxGraph XML) を白背景の SVG にレンダリングする。
 *
 * 【背景】
 *   本来 .drawio → svg の書き出しは drawio-desktop で行うのが標準
 *   (mise task "drawio:export" 参照)。しかし drawio-desktop が導入できない
 *   環境 (GitHub releases がブロックされている等) でも図を生成できるよう、
 *   事前インストール済みの Chromium (Playwright) と mxgraph をローカルに
 *   使ってレンダリングするフォールバック実装。
 *
 * 【制約】
 *   mxgraph 標準の図形のみを扱う (drawio 独自ステンシルは非対応)。
 *   本 textbook の .drawio は mxgraph 互換の図形だけで描いている。
 *
 * 使い方: node render.mjs <input.drawio> <output.svg>
 *   通常は mise task 経由: mise run drawio:generate
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// node_modules はプロジェクトルート (docs/textbook/drawio から 3 つ上) にある
const mxClientPath = resolve(here, '../../../node_modules/mxgraph/javascript/mxClient.js');

const inFile = process.argv[2];
const outFile = process.argv[3];
if (!inFile || !outFile) {
  console.error('usage: node render.mjs <input.drawio> <output.svg>');
  process.exit(1);
}

const raw = readFileSync(inFile, 'utf-8');
const match = raw.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/);
if (!match) {
  console.error(`ERROR: ${inFile} に非圧縮の <mxGraphModel> が見つかりません。` +
    'drawio 保存時に「圧縮」を無効にしてください。');
  process.exit(1);
}
const modelXml = match[0];

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#fff;font-family:'Noto Sans CJK JP',sans-serif;}</style></head>
<body><div id="g" style="position:absolute;overflow:hidden;"></div></body></html>`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.setContent(html, { waitUntil: 'load' });
  // mxgraph 本体を読み込む前にリソースの自動ロードを止める (data ページで XHR 不可のため)
  await page.evaluate(() => {
    window.mxLoadResources = false;
    window.mxLoadStylesheets = false;
    window.mxBasePath = '.';
  });
  // mxClient.js は addScriptTag で読み込む (テンプレート埋め込みだと </script> 等で壊れる)
  await page.addScriptTag({ path: mxClientPath });

  const svg = await page.evaluate((modelXml) => {
    const container = document.getElementById('g');
    const graph = new mxGraph(container);
    graph.setEnabled(false);
    const doc = mxUtils.parseXml(modelXml);
    const codec = new mxCodec(doc);
    graph.getModel().beginUpdate();
    try {
      codec.decode(doc.documentElement, graph.getModel());
    } finally {
      graph.getModel().endUpdate();
    }
    const b = graph.getGraphBounds();
    const pad = 12;
    const w = Math.ceil(b.x + b.width + pad);
    const h = Math.ceil(b.y + b.height + pad);
    const el = container.getElementsByTagName('svg')[0];
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    el.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', '#ffffff');
    el.insertBefore(rect, el.firstChild);
    return el.outerHTML;
  }, modelXml);

  writeFileSync(outFile, '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + '\n', 'utf-8');
  console.log('wrote', outFile);
} finally {
  await browser.close();
}
