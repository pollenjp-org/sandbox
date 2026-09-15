// Build a `.drawio.svg` from a draw.io mxfile XML.
//
// drawio MCP (`@drawio/mcp`) only returns an editor URL; it does not export.
// `drawio-desktop` (Electron) is the official exporter but unavailable in
// this sandbox. So we:
//   1. Parse the mxfile XML to learn each cell's geometry and label.
//   2. Render a simple SVG (rects + arrows + labels).
//   3. Set the SVG root's `content` attribute to the original mxfile XML.
//      That is the key bit: draw.io recognises an SVG with `content=...`
//      as an editable diagram and re-imports the mxfile on open.
//
// Usage: node render-drawio-svg.mjs <input.xml> <output.drawio.svg>

import { readFileSync, writeFileSync } from "node:fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: render-drawio-svg.mjs <input.xml> <output.drawio.svg>");
  process.exit(1);
}

const xml = readFileSync(inPath, "utf8");
const doc = new DOMParser().parseFromString(xml, "text/xml");

const cells = Array.from(doc.getElementsByTagName("mxCell"));
const nodes = new Map();
const edges = [];

for (const c of cells) {
  const id = c.getAttribute("id");
  const value = c.getAttribute("value") || "";
  const isVertex = c.getAttribute("vertex") === "1";
  const isEdge = c.getAttribute("edge") === "1";
  const style = c.getAttribute("style") || "";

  if (isVertex) {
    const g = c.getElementsByTagName("mxGeometry")[0];
    if (!g) continue;
    nodes.set(id, {
      id,
      label: value,
      x: +g.getAttribute("x") || 0,
      y: +g.getAttribute("y") || 0,
      w: +g.getAttribute("width") || 80,
      h: +g.getAttribute("height") || 40,
      fill: pick(style, "fillColor") || "#ffffff",
      stroke: pick(style, "strokeColor") || "#333333",
    });
  } else if (isEdge) {
    edges.push({
      source: c.getAttribute("source"),
      target: c.getAttribute("target"),
    });
  }
}

function pick(style, key) {
  const m = style.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
  return m ? m[1] : null;
}

const pad = 20;
const xs = [...nodes.values()].flatMap((n) => [n.x, n.x + n.w]);
const ys = [...nodes.values()].flatMap((n) => [n.y, n.y + n.h]);
const minX = Math.min(...xs) - pad;
const minY = Math.min(...ys) - pad;
const maxX = Math.max(...xs) + pad;
const maxY = Math.max(...ys) + pad;
const width = maxX - minX;
const height = maxY - minY;

const tx = (x) => x - minX;
const ty = (y) => y - minY;

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const stripHtml = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    // The `content` attribute makes draw.io treat this SVG as an editable diagram.
    `content="${esc(new XMLSerializer().serializeToString(doc))}">`,
);
parts.push(
  `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" ` +
    `markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="#333"/></marker></defs>`,
);
parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

for (const n of nodes.values()) {
  const x = tx(n.x);
  const y = ty(n.y);
  parts.push(
    `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="6" ry="6" ` +
      `fill="${n.fill}" stroke="${n.stroke}" stroke-width="1.5"/>`,
  );
  parts.push(
    `<text x="${x + n.w / 2}" y="${y + n.h / 2}" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="13" text-anchor="middle" dominant-baseline="middle" fill="#222">` +
      esc(stripHtml(n.label)) +
      `</text>`,
  );
}

for (const e of edges) {
  const s = nodes.get(e.source);
  const t = nodes.get(e.target);
  if (!s || !t) continue;
  const sx = tx(s.x + s.w / 2);
  const sy = ty(s.y + s.h / 2);
  const tx_ = tx(t.x + t.w / 2);
  const ty_ = ty(t.y + t.h / 2);
  // Trim to box edge so the arrow tip touches the rectangle, not its centre.
  const [ex, ey] = trimToBox(sx, sy, tx_, ty_, tx(t.x), ty(t.y), t.w, t.h);
  parts.push(
    `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#333" ` +
      `stroke-width="1.5" marker-end="url(#arrow)"/>`,
  );
}

parts.push(`</svg>`);
writeFileSync(outPath, parts.join("\n"));
console.log(`wrote ${outPath} (${width}x${height}, ${nodes.size} nodes, ${edges.length} edges)`);

function trimToBox(sx, sy, tx, ty, bx, by, bw, bh) {
  const dx = tx - sx;
  const dy = ty - sy;
  const candidates = [];
  if (dx !== 0) {
    const tLeft = (bx - sx) / dx;
    const tRight = (bx + bw - sx) / dx;
    candidates.push(tLeft, tRight);
  }
  if (dy !== 0) {
    const tTop = (by - sy) / dy;
    const tBot = (by + bh - sy) / dy;
    candidates.push(tTop, tBot);
  }
  let best = 1;
  for (const k of candidates) {
    if (k <= 0 || k > 1) continue;
    const x = sx + dx * k;
    const y = sy + dy * k;
    if (x >= bx - 0.5 && x <= bx + bw + 0.5 && y >= by - 0.5 && y <= by + bh + 0.5) {
      if (k < best) best = k;
    }
  }
  return [sx + dx * best, sy + dy * best];
}
