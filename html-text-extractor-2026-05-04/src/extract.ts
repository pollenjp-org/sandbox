const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BR",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

const walk = (node: Node, out: string[]): void => {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.nodeValue ?? "");
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName)) {
    return;
  }
  const isBlock = BLOCK_TAGS.has(el.tagName);
  if (isBlock) {
    out.push("\n");
  }
  for (const child of Array.from(el.childNodes)) {
    walk(child, out);
  }
  if (isBlock) {
    out.push("\n");
  }
};

// HTML から表示テキストを抽出する。
// - <script>/<style>/<noscript>/<template> の中身は除外。
// - ブロック要素の境界には改行を入れる。
// - 空白の繰り返しは 1 つに、3 行以上の連続改行は 2 行に圧縮する。
export const extractText = (html: string): string => {
  if (!html.trim()) {
    return "";
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  walk(doc.body, out);
  const raw = out.join("");
  return raw
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
