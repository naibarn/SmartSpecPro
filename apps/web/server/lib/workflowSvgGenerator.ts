/**
 * Pure TypeScript SVG topology diagram generator for workflow templates.
 * Converts a WorkflowJson object into a compact SVG string for gallery previews.
 * No external dependencies — pure, synchronous, side-effect-free.
 */

export interface WorkflowNodeData {
  nodeType: string;
  label: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
  parentId?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

export interface WorkflowJson {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// --- Color map by nodeType ---

const NODE_TYPE_COLORS: Record<string, string> = {
  // triggers — green
  schedule_trigger: "#10B981",
  webhook_trigger: "#10B981",
  manual_trigger: "#10B981",
  event_trigger: "#10B981",
  // ai — blue
  llm_call: "#3B82F6",
  rag_query: "#3B82F6",
  embedding_generator: "#3B82F6",
  multi_model_router: "#3B82F6",
  prompt_template: "#3B82F6",
  output_parser: "#3B82F6",
  // flow_control — purple
  conditional: "#8B5CF6",
  loop: "#8B5CF6",
  parallel: "#8B5CF6",
  join: "#8B5CF6",
  subworkflow: "#8B5CF6",
  retry: "#8B5CF6",
  circuit_breaker: "#8B5CF6",
  try_catch: "#8B5CF6",
  delay: "#8B5CF6",
  // data — orange
  database_query: "#F97316",
  transformer: "#F97316",
  filter: "#F97316",
  aggregator: "#F97316",
  csv_parser: "#F97316",
  template_engine: "#F97316",
  read_file: "#F97316",
  write_file: "#F97316",
  // integrations — cyan
  http_request: "#06B6D4",
  graphql_request: "#06B6D4",
  websocket_client: "#06B6D4",
  storage_action: "#06B6D4",
  // outputs — red
  send_email: "#EF4444",
  send_notification: "#EF4444",
  // observability — gray
  metrics_collector: "#6B7280",
  logger_node: "#6B7280",
  secrets_vault: "#6B7280",
  // skills/media/human — amber
  generate_image: "#F59E0B",
  skill: "#F59E0B",
  approval_gate: "#F59E0B",
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
    return label.slice(0, MAX_LABEL_LEN) + "…";
  }
  return label;
}

/** Kahn's algorithm topological sort with cycle-safe fallback. */
function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeMap = new Map<string, WorkflowNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }

  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: WorkflowNode[] = [];
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
  sortedNodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Map<string, { col: number; row: number }> {
  const nodeSet = new Set(sortedNodes.map((n) => n.id));
  const depth = new Map<string, number>();

  for (const n of sortedNodes) depth.set(n.id, 0);

  // Compute longest-path depth via edges
  for (const n of sortedNodes) {
    for (const e of edges) {
      if (e.source === n.id && nodeSet.has(e.target)) {
        const newDepth = (depth.get(n.id) ?? 0) + 1;
        if (newDepth > (depth.get(e.target) ?? 0)) {
          depth.set(e.target, newDepth);
        }
      }
    }
  }

  // Group nodes by column
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

export function generateWorkflowSvg(workflowJson: WorkflowJson): string {
  const { nodes, edges } = workflowJson;

  // Empty workflow
  if (nodes.length === 0) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_W}" height="${VIEWPORT_H}" viewBox="0 0 ${VIEWPORT_W} ${VIEWPORT_H}">` +
      `<rect x="0" y="0" width="${VIEWPORT_W}" height="${VIEWPORT_H}" rx="12" fill="#F3F4F6" />` +
      `<text x="${VIEWPORT_W / 2}" y="${VIEWPORT_H / 2}" text-anchor="middle" fill="#6B7280" font-size="16" font-family="Arial, sans-serif">No nodes</text>` +
      `</svg>`
    );
  }

  const sorted = topoSort(nodes, edges);
  const grid = assignGridPositions(sorted, edges);

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
  for (const e of edges) {
    const srcPos = nodePositions.get(e.source);
    const tgtPos = nodePositions.get(e.target);
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
    nodeSvg.push(renderNode(n.data.label, n.data.nodeType, pos.x, pos.y));
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
