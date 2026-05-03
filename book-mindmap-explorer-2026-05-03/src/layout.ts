import type { Edge, Node } from "@xyflow/react";
import type { BookNode } from "./types";

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 92;
const X_GAP = 320;
const Y_GAP = 18;

export type MindNodeData = {
  bookNode: BookNode;
  expanded: boolean;
  hasChildren: boolean;
  selected: boolean;
};

/**
 * 展開状態を考慮して、この部分木が縦方向に占める高さを返す。
 * 折り畳まれているノードや葉ノードは NODE_HEIGHT のみ。
 */
function subtreeHeight(node: BookNode, expanded: ReadonlySet<string>): number {
  const children = node.children;
  if (!children || children.length === 0 || !expanded.has(node.id)) {
    return NODE_HEIGHT;
  }
  let total = 0;
  for (const child of children) {
    total += subtreeHeight(child, expanded);
  }
  total += (children.length - 1) * Y_GAP;
  return Math.max(NODE_HEIGHT, total);
}

/**
 * 木構造から react-flow の nodes / edges を生成する。
 * 子ノードが縦に並ぶ高さをまず計算し、親ノードはその中央に配置する典型的な
 * "tidy tree" 配置 (簡易版)。
 */
export function buildGraph(
  root: BookNode,
  expanded: ReadonlySet<string>,
  selectedId: string | null,
): { nodes: Node<MindNodeData>[]; edges: Edge[] } {
  const nodes: Node<MindNodeData>[] = [];
  const edges: Edge[] = [];

  const visit = (
    node: BookNode,
    depth: number,
    yTop: number,
    parentId: string | null,
  ): void => {
    const height = subtreeHeight(node, expanded);
    const x = depth * X_GAP;
    const y = yTop + height / 2 - NODE_HEIGHT / 2;

    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.id);

    nodes.push({
      id: node.id,
      type: "mind",
      position: { x, y },
      data: {
        bookNode: node,
        expanded: isExpanded,
        hasChildren,
        selected: selectedId === node.id,
      },
      draggable: false,
      selectable: false,
    });

    if (parentId) {
      edges.push({
        id: `${parentId}->${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
        style: { stroke: "#3a4660", strokeWidth: 2 },
        animated: false,
      });
    }

    if (hasChildren && isExpanded) {
      let cursor = yTop;
      for (const child of node.children!) {
        const childHeight = subtreeHeight(child, expanded);
        visit(child, depth + 1, cursor, node.id);
        cursor += childHeight + Y_GAP;
      }
    }
  };

  visit(root, 0, 0, null);
  return { nodes, edges };
}
