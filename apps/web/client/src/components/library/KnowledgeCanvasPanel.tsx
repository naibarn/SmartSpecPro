import { useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  FilePlus2,
  LayoutGrid,
  Loader2,
  PackagePlus,
  Save,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import type { LibraryCanvasBoard } from "@shared/libraryCanvas";

type KnowledgeCanvasPanelProps = {
  onOpenBoard?: (itemId: number, title: string) => void;
  selectedNote?: {
    libraryItemId: number;
    title: string;
    logicalPath: string | null;
  } | null;
};

type KnowledgeCanvasFlowNodeData = {
  label: string;
  subtitle: string | null;
  cardType: "note" | "evidence" | "reference";
  libraryItemId: number | null;
};

const EMPTY_CANVAS_BOARD: LibraryCanvasBoard = {
  version: "v1",
  nodes: [],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
};

function toneForCardType(cardType: KnowledgeCanvasFlowNodeData["cardType"]) {
  switch (cardType) {
    case "note":
      return {
        border: "border-sky-300",
        bg: "bg-sky-50",
        badge: "bg-sky-600",
        color: "#0284c7",
        label: "Note",
      };
    case "evidence":
      return {
        border: "border-emerald-300",
        bg: "bg-emerald-50",
        badge: "bg-emerald-600",
        color: "#059669",
        label: "Evidence",
      };
    case "reference":
      return {
        border: "border-amber-300",
        bg: "bg-amber-50",
        badge: "bg-amber-600",
        color: "#d97706",
        label: "Reference",
      };
    default:
      return {
        border: "border-slate-300",
        bg: "bg-slate-50",
        badge: "bg-slate-600",
        color: "#475569",
        label: "Card",
      };
  }
}

function KnowledgeCanvasCardNode(props: NodeProps<Node<KnowledgeCanvasFlowNodeData>>) {
  const tone = toneForCardType(props.data.cardType);

  return (
    <div
      className={`min-w-[220px] rounded-2xl border px-3 py-3 shadow-sm transition ${tone.border} ${tone.bg} ${
        props.selected ? "ring-2 ring-sky-300" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-white !bg-slate-500" />
      <div className="flex items-start justify-between gap-2">
        <div className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white ${tone.badge}`}>
          {tone.label}
        </div>
        {props.data.libraryItemId ? (
          <Badge variant="outline" className="rounded-full bg-white/70 text-[10px]">
            linked
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">
        {props.data.label}
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-600">
        {props.data.subtitle ?? "Canvas card"}
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-white !bg-slate-500" />
    </div>
  );
}

const canvasNodeTypes: NodeTypes = {
  knowledgeCard: KnowledgeCanvasCardNode,
};

function toFlowNodes(board: LibraryCanvasBoard): Node<KnowledgeCanvasFlowNodeData>[] {
  return board.nodes.map((node) => ({
    id: node.id,
    type: "knowledgeCard",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    data: {
      label: node.label ?? node.id,
      subtitle: node.libraryItemId ? `Library item #${node.libraryItemId}` : null,
      cardType: node.type,
      libraryItemId: node.libraryItemId ?? null,
    },
  }));
}

function toFlowEdges(board: LibraryCanvasBoard): Edge[] {
  return board.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label ?? undefined,
    animated: false,
    style: {
      stroke: "#64748b",
      strokeWidth: 1.8,
    },
    markerEnd: {
      type: "arrowclosed",
      color: "#64748b",
    },
  }));
}

function buildBoardFromFlow(params: {
  nodes: Node<KnowledgeCanvasFlowNodeData>[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
}): LibraryCanvasBoard {
  return {
    version: "v1",
    viewport: params.viewport,
    nodes: params.nodes.map((node) => ({
      id: node.id,
      type: node.data.cardType,
      libraryItemId: node.data.libraryItemId ?? undefined,
      label: node.data.label,
      x: node.position.x,
      y: node.position.y,
      width: typeof node.width === "number" ? node.width : undefined,
      height: typeof node.height === "number" ? node.height : undefined,
    })),
    edges: params.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      label: typeof edge.label === "string" ? edge.label : undefined,
    })),
  };
}

function buildSnapshotSignature(input: {
  title: string;
  description: string;
  visibility: "private" | "team" | "public";
  board: LibraryCanvasBoard;
}): string {
  return JSON.stringify(input);
}

function KnowledgeCanvasPanelInner(props: KnowledgeCanvasPanelProps) {
  const trpcUtils = trpc.useUtils();
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [boardTitle, setBoardTitle] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardVisibility, setBoardVisibility] = useState<"private" | "team" | "public">("private");
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<Node<KnowledgeCanvasFlowNodeData>, Edge> | null>(null);
  const [savedSignature, setSavedSignature] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<KnowledgeCanvasFlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const listBoardsQuery = trpc.library.listDocuments.useQuery(
    {
      scope: "my_library",
      sort: "updated_desc",
      limit: 20,
      offset: 0,
      filters: {
        itemType: "canvas_board",
      },
    },
    {
      refetchOnWindowFocus: false,
    },
  );
  const selectedBoardQuery = trpc.library.getCanvasBoard.useQuery(
    selectedBoardId ? { itemId: selectedBoardId } : { itemId: 0 },
    {
      enabled: selectedBoardId != null,
      refetchOnWindowFocus: false,
    },
  );
  const createBoardMutation = trpc.library.createCanvasBoard.useMutation({
    onSuccess: async (result) => {
      await trpcUtils.library.listDocuments.invalidate();
      await trpcUtils.library.getCanvasBoard.invalidate();
      setSelectedBoardId(result.itemId);
      toast.success("Canvas board created.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateBoardMutation = trpc.library.updateCanvasBoard.useMutation({
    onSuccess: async (result) => {
      await trpcUtils.library.listDocuments.invalidate();
      await trpcUtils.library.getCanvasBoard.invalidate({ itemId: result.itemId });
      setSavedSignature(
        buildSnapshotSignature({
          title: result.title,
          description: result.description ?? "",
          visibility: result.visibility,
          board: result.board,
        }),
      );
      toast.success("Canvas board saved.");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!selectedBoardId && (listBoardsQuery.data?.results?.length ?? 0) > 0) {
      setSelectedBoardId(listBoardsQuery.data?.results?.[0]?.id ?? null);
    }
  }, [listBoardsQuery.data, selectedBoardId]);

  useEffect(() => {
    if (!selectedBoardQuery.data) {
      return;
    }

    setBoardTitle(selectedBoardQuery.data.title);
    setBoardDescription(selectedBoardQuery.data.description ?? "");
    setBoardVisibility(selectedBoardQuery.data.visibility);
    setNodes(toFlowNodes(selectedBoardQuery.data.board));
    setEdges(toFlowEdges(selectedBoardQuery.data.board));
    setSavedSignature(
      buildSnapshotSignature({
        title: selectedBoardQuery.data.title,
        description: selectedBoardQuery.data.description ?? "",
        visibility: selectedBoardQuery.data.visibility,
        board: selectedBoardQuery.data.board,
      }),
    );
  }, [selectedBoardQuery.data, setEdges, setNodes]);

  const currentBoard = useMemo(
    () =>
      buildBoardFromFlow({
        nodes,
        edges,
        viewport: reactFlowInstance?.getViewport(),
      }),
    [edges, nodes, reactFlowInstance],
  );

  const isDirty = useMemo(
    () =>
      buildSnapshotSignature({
        title: boardTitle,
        description: boardDescription,
        visibility: boardVisibility,
        board: currentBoard,
      }) !== savedSignature,
    [boardDescription, boardTitle, boardVisibility, currentBoard, savedSignature],
  );

  const handleCreateBoard = () => {
    createBoardMutation.mutate({
      title: `Knowledge Canvas ${new Date().toLocaleString()}`,
      description: "Knowledge Vault canvas board",
      visibility: "private",
      board: EMPTY_CANVAS_BOARD,
    });
  };

  const handleSaveBoard = () => {
    if (!selectedBoardId) {
      return;
    }

    updateBoardMutation.mutate({
      itemId: selectedBoardId,
      title: boardTitle.trim() || "Knowledge Canvas",
      description: boardDescription.trim() || null,
      visibility: boardVisibility,
      board: currentBoard,
    });
  };

  const addCard = (input: {
    label: string;
    subtitle: string | null;
    cardType: KnowledgeCanvasFlowNodeData["cardType"];
    libraryItemId?: number | null;
  }) => {
    const suffix = Date.now().toString(36);
    const nextIndex = nodes.length;
    setNodes((current) => [
      ...current,
      {
        id: `${input.cardType}-${suffix}`,
        type: "knowledgeCard",
        position: {
          x: 120 + (nextIndex % 3) * 280,
          y: 80 + Math.floor(nextIndex / 3) * 180,
        },
        data: {
          label: input.label,
          subtitle: input.subtitle,
          cardType: input.cardType,
          libraryItemId: input.libraryItemId ?? null,
        },
      },
    ]);
  };

  const handleConnect = (connection: Connection) => {
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `edge-${Date.now().toString(36)}`,
          markerEnd: {
            type: "arrowclosed",
            color: "#64748b",
          },
          style: {
            stroke: "#64748b",
            strokeWidth: 1.8,
          },
        },
        current,
      ),
    );
  };

  const activeBoardTitle = selectedBoardQuery.data?.title ?? boardTitle;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Canvas Boards
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Turn board registries into real working surfaces for note clusters,
              evidence mapping, and synthesis planning.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                addCard({
                  label: "Reference card",
                  subtitle: "Free-form reference or summary",
                  cardType: "reference",
                })
              }
              disabled={!selectedBoardId}
            >
              <StickyNote className="mr-2 h-4 w-4" />
              Add reference
            </Button>
            {props.selectedNote ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  addCard({
                    label: props.selectedNote!.title,
                    subtitle: props.selectedNote!.logicalPath,
                    cardType: "note",
                    libraryItemId: props.selectedNote!.libraryItemId,
                  })
                }
                disabled={!selectedBoardId}
              >
                <PackagePlus className="mr-2 h-4 w-4" />
                Add current note
              </Button>
            ) : null}
            <Button type="button" onClick={handleCreateBoard} disabled={createBoardMutation.isPending}>
              {createBoardMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FilePlus2 className="mr-2 h-4 w-4" />
              )}
              New canvas board
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs leading-5 text-sky-900">
          Canvas edges stay visual and curated. They do not silently become backlinks or runtime retrieval edges.
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Canvas boards
          </div>
          <div className="space-y-2">
            {(listBoardsQuery.data?.results ?? []).map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => {
                  setSelectedBoardId(board.id);
                }}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selectedBoardId === board.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="truncate font-medium text-slate-900">
                  {board.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Updated {new Date(board.updated_at).toLocaleString()}
                </div>
              </button>
            ))}
            {!listBoardsQuery.isLoading && (listBoardsQuery.data?.results ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No canvas boards yet. Create one and start pinning notes, evidence, and references into a real board.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selectedBoardId ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Select or create a canvas board to begin editing.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <Input
                      value={boardTitle}
                      onChange={(event) => setBoardTitle(event.target.value)}
                      placeholder="Canvas title"
                      className="h-11 rounded-2xl border-slate-300"
                    />
                    <Select
                      value={boardVisibility}
                      onValueChange={(value) =>
                        setBoardVisibility(value as "private" | "team" | "public")
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-slate-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    value={boardDescription}
                    onChange={(event) => setBoardDescription(event.target.value)}
                    placeholder="Describe how this board should be used"
                    className="mt-3 min-h-[92px] rounded-2xl border-slate-300"
                  />
                </div>
                <div className="flex flex-col items-stretch gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveBoard}
                    disabled={!isDirty || updateBoardMutation.isPending}
                  >
                    {updateBoardMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save board
                  </Button>
                  <Badge
                    variant="outline"
                    className={`justify-center rounded-full ${
                      isDirty
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isDirty ? "Unsaved" : "Saved"}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Board
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {activeBoardTitle || "Untitled canvas"}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Nodes
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {nodes.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Edges
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {edges.length}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <LayoutGrid className="h-4 w-4 text-sky-600" />
                    Canvas editor
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        addCard({
                          label: "Evidence cluster",
                          subtitle: "Collect claims, excerpts, and supporting files",
                          cardType: "evidence",
                        })
                      }
                    >
                      Add evidence
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        addCard({
                          label: "Reference card",
                          subtitle: "Reusable summary, thesis, or question",
                          cardType: "reference",
                        })
                      }
                    >
                      Add reference
                    </Button>
                  </div>
                </div>
                <div className="h-[560px] overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={handleConnect}
                    onNodeDoubleClick={(_, node) => {
                      if (node.data.libraryItemId) {
                        props.onOpenBoard?.(
                          node.data.libraryItemId,
                          node.data.label,
                        );
                      }
                    }}
                    onInit={setReactFlowInstance}
                    fitView
                    nodeTypes={canvasNodeTypes}
                    deleteKeyCode={["Backspace", "Delete"]}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Controls className="border border-slate-200 bg-white shadow-sm" />
                    <MiniMap
                      pannable
                      zoomable
                      className="border border-slate-200 bg-white"
                      nodeColor={(node) => {
                        const flowNode = nodes.find((entry) => entry.id === node.id);
                        return flowNode
                          ? toneForCardType(flowNode.data.cardType).color
                          : "#94a3b8";
                      }}
                    />
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
                  </ReactFlow>
                </div>
              </div>
            </div>
          )}
          {selectedBoardQuery.isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading canvas board...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function KnowledgeCanvasPanel(props: KnowledgeCanvasPanelProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeCanvasPanelInner {...props} />
    </ReactFlowProvider>
  );
}

export default KnowledgeCanvasPanel;
