import type { BookNode } from "../types";

type Props = {
  node: BookNode | null;
  onClose: () => void;
};

const KIND_LABEL: Record<BookNode["kind"], string> = {
  root: "Book",
  part: "Part",
  chapter: "Chapter",
  concept: "Concept",
};

/**
 * detail フィールドに書かれた簡易マークダウン (見出し・太字・箇条書き) を
 * 軽量にレンダリングする。本格的なマークダウンライブラリを入れるほどの
 * 用途ではないので最低限。
 */
function renderDetail(text: string) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={{ paddingLeft: 20, margin: "6px 0" }}>
        {listBuf.map((item, i) => (
          <li key={i} style={{ margin: "2px 0" }}>
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      listBuf.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      blocks.push(<div key={blocks.length} style={{ height: 6 }} />);
      continue;
    }
    blocks.push(
      <p key={blocks.length} style={{ margin: "4px 0", lineHeight: 1.6 }}>
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  // **bold** だけ最低限ハンドリング
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={key++} style={{ color: "#f0f6fc" }}>
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : parts;
}

export function DetailPanel({ node, onClose }: Props) {
  return (
    <aside
      style={{
        width: 380,
        height: "100%",
        background: "#0d1117",
        borderLeft: "1px solid #30363d",
        padding: 20,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}
    >
      {!node ? (
        <div style={{ color: "#8b949e", fontSize: 13, lineHeight: 1.6 }}>
          <h3 style={{ marginTop: 0, color: "#e6edf3" }}>使い方</h3>
          <ul style={{ paddingLeft: 20 }}>
            <li>ノード右の <strong>+ / −</strong> で展開・折りたたみ</li>
            <li>ノード本体クリックで詳細をここに表示</li>
            <li>マウスホイールでズーム、ドラッグでパン</li>
            <li>右下のミニマップで全体把握</li>
          </ul>
          <p style={{ marginTop: 16 }}>
            左のマップから章を選ぶと、要約と原文へのリンクが表示されます。
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "#7c5cff",
              }}
            >
              {KIND_LABEL[node.kind]}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #30363d",
                color: "#8b949e",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              閉じる
            </button>
          </div>
          <h2 style={{ margin: 0, color: "#f0f6fc", fontSize: 18 }}>
            {node.title}
          </h2>
          {node.summary && (
            <div
              style={{
                fontSize: 13,
                color: "#c9d1d9",
                fontStyle: "italic",
                borderLeft: "3px solid #30363d",
                paddingLeft: 10,
              }}
            >
              {node.summary}
            </div>
          )}
          {node.detail && (
            <div style={{ fontSize: 13, color: "#c9d1d9" }}>
              {renderDetail(node.detail)}
            </div>
          )}
          {node.url && (
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: "auto",
                display: "inline-block",
                padding: "8px 12px",
                background: "#238636",
                color: "white",
                textDecoration: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              原文を開く ↗
            </a>
          )}
        </>
      )}
    </aside>
  );
}
