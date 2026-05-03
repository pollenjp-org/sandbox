import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MindNodeData } from "../layout";
import { NODE_HEIGHT, NODE_WIDTH } from "../layout";

type Props = NodeProps & {
  data: MindNodeData;
};

const KIND_COLORS: Record<MindNodeData["bookNode"]["kind"], string> = {
  root: "#7c5cff",
  part: "#2f81f7",
  chapter: "#1f6feb",
  concept: "#2ea043",
};

export function MindNode({ data }: Props) {
  const { bookNode, expanded, hasChildren, selected } = data;
  const accent = KIND_COLORS[bookNode.kind];

  return (
    <div
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        background: "#161b22",
        color: "#e6edf3",
        border: `1px solid ${selected ? accent : "#30363d"}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: selected
          ? `0 0 0 2px ${accent}55, 0 6px 18px rgba(0,0,0,0.35)`
          : "0 2px 6px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: "pointer",
        userSelect: "none",
        position: "relative",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
      }}
      title={bookNode.title}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: accent, border: "none" }}
      />
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.3,
          color: "#f0f6fc",
        }}
      >
        {bookNode.title}
      </div>
      {bookNode.summary && (
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            color: "#8b949e",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {bookNode.summary}
        </div>
      )}
      {hasChildren && (
        <div
          data-toggle="true"
          style={{
            position: "absolute",
            right: -10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: accent,
            color: "#0e1116",
            fontSize: 14,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
            border: "2px solid #0e1116",
            cursor: "pointer",
          }}
          aria-label={expanded ? "折りたたむ" : "展開する"}
        >
          {expanded ? "−" : "+"}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: accent, border: "none" }}
      />
    </div>
  );
}
