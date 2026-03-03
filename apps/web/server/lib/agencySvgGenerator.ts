/**
 * Pure TypeScript SVG topology diagram generator for agency marketplace previews.
 * Converts agency agents + communication flows into a compact SVG string.
 * Adapted from workflowSvgGenerator.ts — no external dependencies.
 */

export interface AgencyNode {
  id: string;
  name: string;
  nodeType: string;
  position?: { x: number; y: number } | null;
}

export interface AgencyFlow {
  fromAgentId: string;
  toAgentId: string;
}

// --- Color map by agency nodeType ---

const NODE_TYPE_COLORS: Record<string, string> = {
  agent: "#3B82F6",           // blue
  supervisor: "#8B5CF6",      // purple
  router: "#F97316",          // orange
  aggregator: "#06B6D4",      // cyan
  knowledge_base: "#10B981",  // green
  skill_call: "#F59E0B",      // amber
  human_approval: "#EF4444",  // red
};

const DEFAULT_COLOR = "#6B7280";

const NODE_W = 140;
const NODE_H = 50;
const COL_GAP = 200;
const ROW_GAP = 80;
const VIEWPORT_W = 800;
const VIEWPORT_H = 400;
const PADDING = 40;
const MAX_LABEL_LEN = 18;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getNodeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? DEFAULT_COLOR;
}

function truncateLabel(label: string): string {
  if (label.length > MAX_LABEL_LEN) {
    return label.slice(0, MAX_LABEL_LEN) + "\u2026";
  }
  return label;
}

/** Kahn's algorithm topological sort with cycle-safe fallback. */
function topoSort(nodes: AgencyNode[], flows: AgencyFlow[]): AgencyNode[] {
  const nodeMap = new Map<string, AgencyNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }

  for (const f of flows) {
    if (!nodeMap.has(f.fromAgentId) || !nodeMap.has(f.toAgentId)) continue;
    adj.get(f.fromAgentId)!.push(f.toAgentId);
    inDegree.set(f.toAgentId, (inDegree.get(f.toAgentId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: AgencyNode[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    visited.add(id);
    sorted.push(nodeMap.get(id)!);

    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Append any remaining nodes (cycles) in original order
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      sorted.push(n);
    }
  }

  return sorted;
}

/** Assign grid positions based on longest path from roots. */
function assignGridPositions(
  sortedNodes: AgencyNode[],
  flows: AgencyFlow[],
): Map<string, { col: number; row: number }> {
  const nodeSet = new Set(sortedNodes.map((n) => n.id));
  const depth = new Map<string, number>();

  for (const n of sortedNodes) depth.set(n.id, 0);

  for (const n of sortedNodes) {
    for (const f of flows) {
      if (f.fromAgentId === n.id && nodeSet.has(f.toAgentId)) {
        const newDepth = (depth.get(n.id) ?? 0) + 1;
        if (newDepth > (depth.get(f.toAgentId) ?? 0)) {
          depth.set(f.toAgentId, newDepth);
        }
      }
    }
  }

  const columns = new Map<number, string[]>();
  for (const n of sortedNodes) {
    const col = depth.get(n.id) ?? 0;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(n.id);
  }

  const positions = new Map<string, { col: number; row: number }>();
  for (const [col, ids] of columns) {
    for (let row = 0; row < ids.length; row++) {
      positions.set(ids[row], { col, row });
    }
  }

  return positions;
}

function renderNode(label: string, nodeType: string, x: number, y: number): string {
  const color = getNodeColor(nodeType);
  const truncated = escapeXml(truncateLabel(label));
  return (
    `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="${color}" />` +
    `<text x="${x + NODE_W / 2}" y="${y + NODE_H / 2 + 5}" text-anchor="middle" fill="#FFFFFF" font-size="12" font-family="Arial, sans-serif">${truncated}</text>`
  );
}

function renderEdge(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): string {
  const cx1 = sourceX + 60;
  const cx2 = targetX - 60;
  return `<path d="M ${sourceX},${sourceY} C ${cx1},${sourceY} ${cx2},${targetY} ${targetX},${targetY}" fill="none" stroke="#94A3B8" stroke-width="2" marker-end="url(#arrowhead)" />`;
}

export function generateAgencySvg(nodes: AgencyNode[], flows: AgencyFlow[]): string {
  if (nodes.length === 0) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_W}" height="${VIEWPORT_H}" viewBox="0 0 ${VIEWPORT_W} ${VIEWPORT_H}">` +
      `<rect x="0" y="0" width="${VIEWPORT_W}" height="${VIEWPORT_H}" rx="12" fill="#F3F4F6" />` +
      `<text x="${VIEWPORT_W / 2}" y="${VIEWPORT_H / 2}" text-anchor="middle" fill="#6B7280" font-size="16" font-family="Arial, sans-serif">No agents</text>` +
      `</svg>`
    );
  }

  const sorted = topoSort(nodes, flows);
  const grid = assignGridPositions(sorted, flows);

  // Compute pixel positions
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const n of sorted) {
    const pos = grid.get(n.id)!;
    const x = pos.col * COL_GAP;
    const y = pos.row * ROW_GAP;
    nodePositions.set(n.id, { x, y });
  }

  // Compute bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const { x, y } of nodePositions.values()) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + NODE_W);
    maxY = Math.max(maxY, y + NODE_H);
  }

  // Scale to fit viewport
  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;
  const availW = VIEWPORT_W - 2 * PADDING;
  const availH = VIEWPORT_H - 2 * PADDING;
  const scale = Math.min(availW / contentW, availH / contentH, 1);
  const offsetX = PADDING + (availW - contentW * scale) / 2 - minX * scale;
  const offsetY = PADDING + (availH - contentH * scale) / 2 - minY * scale;

  // Render edges
  const edgeSvg: string[] = [];
  for (const f of flows) {
    const srcPos = nodePositions.get(f.fromAgentId);
    const tgtPos = nodePositions.get(f.toAgentId);
    if (!srcPos || !tgtPos) continue;
    edgeSvg.push(
      renderEdge(
        srcPos.x + NODE_W,
        srcPos.y + NODE_H / 2,
        tgtPos.x,
        tgtPos.y + NODE_H / 2,
      ),
    );
  }

  // Render nodes
  const nodeSvg: string[] = [];
  for (const n of sorted) {
    const pos = nodePositions.get(n.id)!;
    nodeSvg.push(renderNode(n.name, n.nodeType, pos.x, pos.y));
  }

  const defs =
    `<defs>` +
    `<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">` +
    `<polygon points="0 0, 10 3.5, 0 7" fill="#94A3B8" />` +
    `</marker>` +
    `</defs>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_W}" height="${VIEWPORT_H}" viewBox="0 0 ${VIEWPORT_W} ${VIEWPORT_H}">` +
    defs +
    `<g transform="translate(${offsetX.toFixed(2)},${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})">` +
    edgeSvg.join("") +
    nodeSvg.join("") +
    `</g>` +
    `</svg>`
  );
}
