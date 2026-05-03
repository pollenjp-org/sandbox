import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { sreBook } from "./data/sreBook";
import type { BookNode } from "./types";
import { buildGraph } from "./layout";
import { MindNode } from "./components/MindNode";
import { DetailPanel } from "./components/DetailPanel";

const nodeTypes = { mind: MindNode };

/**
 * 木を辿って id → BookNode の辞書を作る。詳細パネル表示時の参照用。
 */
function indexNodes(node: BookNode, acc: Map<string, BookNode>): Map<string, BookNode> {
  acc.set(node.id, node);
  for (const c of node.children ?? []) indexNodes(c, acc);
  return acc;
}

export function App() {
  const nodeIndex = useMemo(() => indexNodes(sreBook, new Map()), []);

  // 初期状態: ルート + Part だけ展開しておく
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    initial.add(sreBook.id);
    for (const part of sreBook.children ?? []) initial.add(part.id);
    return initial;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(
    () => buildGraph(sreBook, expanded, selectedId),
    [expanded, selectedId],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (event, rfNode) => {
      // 子があるノードで右側の +/- ボタンが押された場合は展開トグル
      const target = event.target as HTMLElement;
      if (target.closest('[data-toggle="true"]')) {
        toggle(rfNode.id);
        return;
      }
      // それ以外はノード選択 (詳細パネル表示)
      setSelectedId(rfNode.id);
    },
    [toggle],
  );

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    const walk = (n: BookNode) => {
      if (n.children?.length) {
        all.add(n.id);
        n.children.forEach(walk);
      }
    };
    walk(sreBook);
    setExpanded(all);
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set([sreBook.id]));
  }, []);

  const selected = selectedId ? (nodeIndex.get(selectedId) ?? null) : null;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <Header onExpandAll={expandAll} onCollapseAll={collapseAll} />
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.0 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll
          >
            <Background variant={BackgroundVariant.Dots} gap={24} color="#1f2630" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                const data = n.data as { bookNode?: { kind?: string } } | undefined;
                const kind = data?.bookNode?.kind;
                return (
                  { root: "#7c5cff", part: "#2f81f7", chapter: "#1f6feb", concept: "#2ea043" }[
                    kind as string
                  ] ?? "#888"
                );
              }}
              maskColor="rgba(13,17,23,0.7)"
              style={{ background: "#161b22" }}
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      <DetailPanel node={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function Header({
  onExpandAll,
  onCollapseAll,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "rgba(13,17,23,0.85)",
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #30363d",
        backdropFilter: "blur(4px)",
      }}
    >
      <strong style={{ fontSize: 14, color: "#f0f6fc" }}>
        Book Mindmap Explorer
      </strong>
      <span style={{ fontSize: 12, color: "#8b949e" }}>— Google SRE Book</span>
      <span style={{ width: 8 }} />
      <button onClick={onExpandAll} style={btnStyle}>
        全部展開
      </button>
      <button onClick={onCollapseAll} style={btnStyle}>
        折りたたむ
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#21262d",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  padding: "4px 10px",
  borderRadius: 5,
  fontSize: 12,
  cursor: "pointer",
};
