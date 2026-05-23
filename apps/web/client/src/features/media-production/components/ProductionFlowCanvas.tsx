import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, Eye, Image, ListTree, Mic, MoreHorizontal, MousePointer2, Music, Play, Plus, Settings2, Trash2, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRODUCTION_NODE_CATALOG, getProductionNodeCatalogEntry, type ProductionFlowEdge, type ProductionFlowEdgeKind, type ProductionFlowNode, type ProductionNodeKind, type ProductionReferenceInput } from "@shared/mediaProduction";
import { edgeKindLabel, nodeKindLabel } from "./displayLabels";
import type { ProductionCanvasCallbacks, ProductionInvalidEdgeWarning, ProductionLocale } from "./types";

export interface ProductionFlowCanvasProps extends ProductionCanvasCallbacks {
  flowNodes: ProductionFlowNode[];
  flowEdges: ProductionFlowEdge[];
  contextAssets: ProductionReferenceInput[];
  selectedNodeId?: string | null;
  locale?: ProductionLocale;
}

function iconForGroup(group: string): typeof Image {
  if (group === "Video" || group === "Handoff" || group === "Delivery") return Video;
  if (group === "Audio") return Music;
  if (group === "Image" || group === "Reference") return Image;
  if (group === "QA") return AlertCircle;
  return ListTree;
}

const nodeKinds = PRODUCTION_NODE_CATALOG.map((entry) => ({
  ...entry,
  icon: entry.kind === "tts" || entry.kind === "text_to_speech" || entry.kind.includes("voice") ? Mic : iconForGroup(entry.group),
}));

const edgeKinds: ProductionFlowEdgeKind[] = ["dependency", "reference", "handoff", "qa", "uses_asset", "requires_before", "generates_for", "qa_of", "approval_gate", "handoff_to", "fallback_to"];

function statusTone(status: string) {
  if (status === "blocked" || status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning" || status === "disabled") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ready" || status === "approved" || status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function validateConnection(
  connection: Connection,
  nodes: ProductionFlowNode[],
  edges: ProductionFlowEdge[],
): ProductionInvalidEdgeWarning | null {
  if (!connection.source) return { code: "missing_source", message: "Connection is missing a source node.", source: connection.source, target: connection.target };
  if (!connection.target) return { code: "missing_target", message: "Connection is missing a target node.", source: connection.source, target: connection.target };
  if (connection.source === connection.target) return { code: "self_edge", message: "A node cannot connect to itself.", source: connection.source, target: connection.target };
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (targetNode?.locked) return { code: "locked_target", message: "Target node is locked.", source: connection.source, target: connection.target };
  const duplicate = edges.some((edge) => edge.source === connection.source && edge.target === connection.target);
  if (duplicate) return { code: "duplicate_edge", message: "This edge already exists.", source: connection.source, target: connection.target };
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  outgoing.set(connection.source, [...(outgoing.get(connection.source) ?? []), connection.target]);
  const stack = [connection.target];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === connection.source) return { code: "cycle_detected", message: "This edge would create a cycle.", source: connection.source, target: connection.target };
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }
  return null;
}

function readableStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function adapterStatusLabel(status: string, locale?: ProductionLocale): string {
  if (status === "mvp_enabled") return locale === "th" ? "พร้อม run" : "Run-ready";
  if (status === "preview_only") return locale === "th" ? "ตั้งค่าได้" : "Config-ready";
  return locale === "th" ? "ยังไม่เปิดใช้" : "Unavailable";
}

function toFlowNode(node: ProductionFlowNode, selectedNodeId?: string | null, locale?: ProductionLocale): Node {
  const statusText = node.collapsed ? (locale === "th" ? "ย่อ" : "collapsed") : readableStatus(node.status);
  return {
    id: node.id,
    position: node.position ?? { x: 0, y: 0 },
    data: {
      label: (
        <div className="w-[172px] max-w-[172px] text-left leading-none">
          <div className="truncate text-[13px] font-semibold leading-5 text-slate-950">{node.title}</div>
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[10.5px] leading-4 text-slate-700">
            <span className="min-w-0 truncate">{nodeKindLabel(node.kind, locale)}</span>
            <span className="shrink-0 truncate text-[10px] font-medium uppercase tracking-normal text-slate-600">{statusText}</span>
          </div>
        </div>
      ),
    },
    className: `rounded border px-3 py-2 shadow-sm [&_.react-flow__handle]:h-2 [&_.react-flow__handle]:w-2 ${statusTone(node.status)} ${
      selectedNodeId === node.id ? "ring-2 ring-sky-400" : ""
    }`,
  };
}

function ProductionFlowCanvasInner({
  flowNodes,
  flowEdges,
  contextAssets,
  selectedNodeId,
  locale,
  onAddNode,
  onSelectNode,
  onConnectNodes,
  onInvalidEdge,
  onNodePositionChange,
  onAssetAddToCanvas,
  onAssetAssignToNode,
  onConfigureNode,
  onDeleteNode,
  onRunNode,
}: ProductionFlowCanvasProps) {
  const isThai = locale === "th";
  const reactFlow = useReactFlow();
  const [warning, setWarning] = useState<ProductionInvalidEdgeWarning | null>(null);
  const [listConnectSourceId, setListConnectSourceId] = useState<string | null>(null);
  const [selectedEdgeKind, setSelectedEdgeKind] = useState<ProductionFlowEdgeKind>("dependency");
  const nodes = useMemo(() => flowNodes.map((node) => toFlowNode(node, selectedNodeId, locale)), [flowNodes, locale, selectedNodeId]);
  const [interactiveNodes, setInteractiveNodes] = useState<Node[]>(nodes);
  const flowNodePositionSignature = useMemo(
    () => flowNodes.map((node) => `${node.id}:${node.position?.x ?? 0}:${node.position?.y ?? 0}`).join("|"),
    [flowNodes],
  );
  const previousPositionSignatureRef = useRef(flowNodePositionSignature);
  const selectedFlowNode = useMemo(() => flowNodes.find((node) => node.id === selectedNodeId) ?? null, [flowNodes, selectedNodeId]);
  const recommendedNodeKinds = useMemo(() => nodeKinds.filter((item) => item.adapterStatus !== "deferred"), []);
  const laterNodeKinds = useMemo(() => nodeKinds.filter((item) => item.adapterStatus === "deferred"), []);
  const edges = useMemo<Edge[]>(
    () => flowEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label ?? edgeKindLabel(edge.kind ?? "dependency", locale) })),
    [flowEdges, locale],
  );

  useEffect(() => {
    const shouldTrustSourcePositions = previousPositionSignatureRef.current !== flowNodePositionSignature;
    previousPositionSignatureRef.current = flowNodePositionSignature;
    setInteractiveNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));
      return nodes.map((node) => {
        const currentNode = currentById.get(node.id);
        if (!currentNode || shouldTrustSourcePositions) return node;
        return { ...node, position: currentNode.position };
      });
    });
  }, [flowNodePositionSignature, nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setInteractiveNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, []);

  const publishWarning = useCallback(
    (nextWarning: ProductionInvalidEdgeWarning) => {
      setWarning(nextWarning);
      onInvalidEdge?.(nextWarning);
    },
    [onInvalidEdge],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const invalid = validateConnection(connection, flowNodes, flowEdges);
      if (invalid) {
        publishWarning(invalid);
        return;
      }
      setWarning(null);
      onConnectNodes?.({
        id: `${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        kind: selectedEdgeKind,
      });
    },
    [flowEdges, flowNodes, onConnectNodes, publishWarning, selectedEdgeKind],
  );

  const onNodeDragStop: NonNullable<ReactFlowProps["onNodeDragStop"]> = useCallback(
    (_event, node) => {
      onNodePositionChange?.(node.id, node.position);
    },
    [onNodePositionChange],
  );

  const renderDrawerItem = (item: (typeof nodeKinds)[number]) => {
    const isDeferred = item.adapterStatus === "deferred";
    return (
      <button
        key={item.kind}
        type="button"
        draggable={!isDeferred}
        disabled={isDeferred}
        title={isDeferred ? item.deferredReason : item.label}
        onClick={() => {
          if (!isDeferred) onAddNode?.(item.kind);
        }}
        onDragStart={(event) => {
          if (isDeferred) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData("application/x-production-node-kind", item.kind);
          event.dataTransfer.effectAllowed = "copy";
        }}
        className="flex min-h-14 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-left text-sm transition-colors hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-slate-50"
      >
        <item.icon className="h-4 w-4 shrink-0 text-sky-600" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900">{item.label}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{item.group} · {adapterStatusLabel(item.adapterStatus, locale)}</span>
          {isDeferred ? <span className="block truncate text-[10px] text-amber-700">{isThai ? "ยังใช้ไม่ได้" : "Not available"}</span> : null}
        </span>
        {isDeferred ? <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">Later</Badge> : <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
    );
  };

  const renderDeferredItem = (item: (typeof nodeKinds)[number]) => (
    <div
      key={item.kind}
      title={item.deferredReason}
      className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-muted-foreground"
    >
      <div className="truncate font-medium text-slate-600">{item.label}</div>
      <div className="truncate text-[10px] text-amber-700">{item.deferredReason ?? (isThai ? "ยังไม่เปิดใช้" : "Not available yet")}</div>
    </div>
  );

  const drawerContent = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">{isThai ? "ใช้ได้ตอนนี้" : "Available now"}</div>
      <div className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1.5 text-[11px] leading-4 text-sky-900">
        {isThai
          ? "รายการด้านล่างคลิกหรือ drag เข้า canvas ได้ทันที ส่วน status บอกว่า run ได้จริงหรือตั้งค่า/ส่งต่อได้"
          : "Items below can be clicked or dragged into the canvas. Status shows whether a node can run now or is config/handoff-ready."}
      </div>
      {recommendedNodeKinds.map(renderDrawerItem)}
      {laterNodeKinds.length ? (
        <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            {isThai ? `ยังไม่เปิดใช้ (${laterNodeKinds.length})` : `Unavailable yet (${laterNodeKinds.length})`}
          </summary>
          <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {isThai
              ? "รายการนี้แสดงไว้เพื่อบอก roadmap แต่ยังไม่ควรใช้ในงานจริง"
              : "These are roadmap placeholders and are not available for production work yet."}
          </div>
          <div className="mt-2 grid gap-1.5">
            {laterNodeKinds.map(renderDeferredItem)}
          </div>
        </details>
      ) : null}
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-muted-foreground">
        {isThai ? "คลิกหรือ drag เข้า canvas" : "Click or drag into the canvas."}
      </div>
    </>
  );

  return (
    <section className="max-w-full overflow-x-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="production-flow-canvas">
      <div className="flex min-w-0 flex-col gap-2 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{isThai ? "Production Canvas" : "Production Canvas"}</div>
          <div className="text-xs text-muted-foreground">
            {isThai ? "เลื่อนหน้าได้ตามปกติ ใช้ปุ่มซูมเมื่อต้องการควบคุม canvas" : "Page scroll stays available. Use canvas controls when you need zoom or pan."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedEdgeKind}
            onChange={(event) => setSelectedEdgeKind(event.target.value as ProductionFlowEdgeKind)}
            className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs"
            aria-label={isThai ? "ชนิด edge" : "Edge kind"}
          >
            {edgeKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </div>
      </div>
      {warning ? (
        <div role="alert" aria-live="polite" className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning.message}</span>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-0 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="order-2 min-w-0 border-t border-slate-100 p-3 xl:order-1 xl:border-r xl:border-t-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ListTree className="h-4 w-4 text-sky-600" />
            {isThai ? "เพิ่ม node" : "Add nodes"}
          </div>
          <details className="mt-3 rounded-md border border-slate-200 bg-white p-2 xl:hidden">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">
              {isThai ? "เปิดรายการ node ที่เพิ่มได้" : "Open available nodes"}
            </summary>
            <div className="mt-2 grid max-h-[320px] gap-2 overflow-y-auto pr-1">{drawerContent}</div>
          </details>
          <div className="mt-3 hidden max-h-[420px] gap-2 overflow-y-auto pr-1 xl:grid">{drawerContent}</div>
        </div>
        <div className="order-1 min-w-0 p-3 xl:order-2">
          <div
            data-testid="production-flow-canvas-viewport"
            className="h-[440px] touch-pan-y overflow-hidden rounded-md border border-slate-200 bg-[radial-gradient(circle_at_1px_1px,#dbe7ef_1px,transparent_0)] [background-size:24px_24px]"
            onWheelCapture={(event) => {
              if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
              window.scrollBy({ top: event.deltaY, behavior: "auto" });
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const nodeKind = event.dataTransfer.getData("application/x-production-node-kind") as ProductionNodeKind;
              const assetId = event.dataTransfer.getData("application/x-production-asset-id");

              if (nodeKind) {
                const catalogEntry = getProductionNodeCatalogEntry(nodeKind);
                if (catalogEntry?.adapterStatus === "deferred") {
                  publishWarning({
                    code: "deferred_node",
                    message: catalogEntry.deferredReason ?? "This node type is deferred until a later release gate.",
                    source: nodeKind,
                    target: null,
                  });
                  return;
                }
                onAddNode?.(nodeKind, position);
                return;
              }

              const asset = contextAssets.find((item) => item.id === assetId);
              if (asset) {
                const nodeAtDrop = flowNodes.find((node) => {
                  const nodePosition = node.position ?? { x: 0, y: 0 };
                  return Math.abs(nodePosition.x - (event.clientX - bounds.left)) < 180 && Math.abs(nodePosition.y - (event.clientY - bounds.top)) < 90;
                });
                onAssetAddToCanvas?.(asset, position);
                onAssetAssignToNode?.({ asset, nodeId: nodeAtDrop?.id ?? selectedNodeId });
              }
            }}
          >
            {nodes.length ? (
              <ReactFlow
                nodes={interactiveNodes}
                edges={edges}
                fitView
                zoomOnScroll={false}
                panOnScroll={false}
                preventScrolling={false}
                onNodesChange={onNodesChange}
                onConnect={onConnect}
                onNodeClick={(_event, node) => onSelectNode?.(node.id)}
                onPaneClick={() => onSelectNode?.(null)}
                onNodeDragStop={onNodeDragStop}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="transparent" gap={24} />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                <div>
                  <MousePointer2 className="mx-auto mb-2 h-6 w-6 text-sky-600" />
                  {isThai ? "ยังไม่มี node ใน canvas" : "No nodes yet. Use the drawer to add the first node."}
                </div>
              </div>
            )}
          </div>

        <div className="mt-3 min-w-0 rounded-md border border-slate-200 bg-white p-3" data-testid="production-node-list-fallback">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{isThai ? "Node Inspector" : "Node Inspector"}</div>
            <Badge variant="outline">{flowNodes.length}</Badge>
          </div>
          {selectedFlowNode ? (
            <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sky-950">{selectedFlowNode.title}</div>
                  <div className="text-xs text-sky-800">{nodeKindLabel(selectedFlowNode.kind, locale)}</div>
                </div>
                <Badge variant="outline" className={statusTone(selectedFlowNode.status)}>{readableStatus(selectedFlowNode.status)}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="min-h-10 border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white sm:min-h-0" onClick={() => onConfigureNode?.(selectedFlowNode.id)}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  {isThai ? "ตั้งค่า" : "Configure"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="min-h-10 sm:min-h-0" disabled={!onRunNode || selectedFlowNode.status === "blocked" || selectedFlowNode.status === "disabled"} onClick={() => onRunNode?.(selectedFlowNode.id)}>
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Run
                </Button>
                <Button type="button" variant="outline" size="sm" className="min-h-10 border-red-200 text-red-700 hover:bg-red-50 sm:min-h-0" onClick={() => onDeleteNode?.(selectedFlowNode.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {isThai ? "ลบ" : "Delete"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2" role="list" aria-label={isThai ? "รายการ node" : "Production nodes"}>
            {flowNodes.length ? (
              flowNodes.map((node) => (
                <div
                  key={node.id}
                  role="listitem"
                  aria-current={selectedNodeId === node.id ? "true" : undefined}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors hover:bg-sky-50 ${
                    selectedNodeId === node.id ? "border-sky-300 bg-sky-50" : "bg-slate-50"
                  }`}
                >
                  <button type="button" className="w-full text-left" onClick={() => onSelectNode?.(node.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{node.title}</span>
                      <Badge variant="outline">{readableStatus(node.status)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{nodeKindLabel(node.kind, locale)}</div>
                  </button>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 sm:min-h-0"
                      onClick={() => onSelectNode?.(node.id)}
                      aria-label={isThai ? `เปิด node ${node.title}` : `Open node ${node.title}`}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "เปิด" : "Open"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 sm:min-h-0"
                      onClick={() => {
                        setListConnectSourceId(node.id);
                        onSelectNode?.(node.id);
                      }}
                      aria-label={isThai ? `เริ่มเชื่อมจาก ${node.title}` : `Start link from ${node.title}`}
                    >
                      {isThai ? "เริ่มเชื่อม" : "Start link"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 sm:min-h-0"
                      disabled={!listConnectSourceId || listConnectSourceId === node.id}
                      onClick={() => {
                        if (!listConnectSourceId) return;
                        const connection: Connection = { source: listConnectSourceId, target: node.id, sourceHandle: null, targetHandle: null };
                        const invalid = validateConnection(connection, flowNodes, flowEdges);
                        if (invalid) {
                          publishWarning(invalid);
                          return;
                        }
                        setWarning(null);
                        onConnectNodes?.({
                          id: `${connection.source}-${connection.target}`,
                          source: connection.source,
                          target: connection.target,
                          kind: selectedEdgeKind,
                        });
                        setListConnectSourceId(null);
                      }}
                    >
                      {isThai ? "เชื่อมมาที่นี่" : "Connect here"}
                    </Button>
                    <details className="relative">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 sm:min-h-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        {isThai ? "เพิ่มเติม" : "More"}
                      </summary>
                      <div className="absolute right-0 z-20 mt-2 grid min-w-36 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => onConfigureNode?.(node.id)}
                          aria-label={isThai ? `ตั้งค่า node ${node.title}` : `Configure node ${node.title}`}
                        >
                          <Settings2 className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "ตั้งค่า" : "Configure"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          disabled={!onRunNode || node.status === "blocked" || node.status === "disabled"}
                          onClick={() => onRunNode?.(node.id)}
                          aria-label={isThai ? `run node ${node.title}` : `Run node ${node.title}`}
                        >
                          <Play className="mr-1 h-3.5 w-3.5" />
                          Run
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start text-red-700 hover:bg-red-50 hover:text-red-800"
                          onClick={() => onDeleteNode?.(node.id)}
                          aria-label={isThai ? `ลบ node ${node.title}` : `Delete node ${node.title}`}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "ลบ" : "Delete"}
                        </Button>
                      </div>
                    </details>
                    {listConnectSourceId === node.id ? (
                      <Badge variant="outline">{isThai ? "ต้นทาง" : "source"}</Badge>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                {isThai ? "ไม่มี fallback list" : "No nodes to list."}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

export function ProductionFlowCanvas(props: ProductionFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProductionFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
