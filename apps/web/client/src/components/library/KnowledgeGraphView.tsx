import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Filter,
  GitBranch,
  Link2,
  RotateCcw,
  Sparkles,
  Tag,
} from "lucide-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import "@xyflow/react/dist/style.css";

type GraphSignalKind =
  | "active"
  | "outgoing"
  | "backlink"
  | "shared_tag"
  | "semantic";

type GraphSignalNode = {
  libraryItemId: number;
  title: string;
  logicalPath: string | null;
  kind: GraphSignalKind;
};

type GraphNodeDetails = {
  libraryItemId: number;
  title: string;
  logicalPath: string | null;
  primaryKind: GraphSignalKind;
  relationKinds: GraphSignalKind[];
  highlights: string[];
};

type GraphEdgeDetails = {
  id: string;
  relationKind: Exclude<GraphSignalKind, "active">;
  sourceTitle: string;
  sourceLogicalPath: string | null;
  targetTitle: string;
  targetLogicalPath: string | null;
  label: string;
  highlights: string[];
};

type RelationFilterState = Record<Exclude<GraphSignalKind, "active">, boolean>;

type KnowledgeGraphViewProps = {
  activeNote: {
    libraryItemId: number;
    title: string;
    logicalPath: string | null;
  };
  outgoing: Array<{
    libraryItemId: number | null;
    title: string | null;
    logicalPath: string | null;
    rawReference?: string;
    status?: string;
  }>;
  backlinks: Array<{
    libraryItemId: number | null;
    title: string | null;
    logicalPath: string | null;
    rawReference?: string;
    status?: string;
  }>;
  sharedTags: Array<{
    libraryItemId: number;
    title: string;
    logicalPath: string | null;
    sharedTags: string[];
  }>;
  semanticRelated: Array<{
    libraryItemId: number;
    title: string;
    logicalPath: string | null;
    score?: number | null;
  }>;
  onOpenItem: (itemId: number, title: string) => void;
  compact?: boolean;
  fillAvailable?: boolean;
};

const DEFAULT_FILTERS: RelationFilterState = {
  backlink: true,
  outgoing: true,
  shared_tag: true,
  semantic: true,
};

function relationKindPriority(kind: GraphSignalKind): number {
  switch (kind) {
    case "active":
      return 0;
    case "backlink":
    case "outgoing":
      return 1;
    case "shared_tag":
      return 2;
    case "semantic":
      return 3;
    default:
      return 4;
  }
}

function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function relationKindLabel(kind: GraphSignalKind): string {
  switch (kind) {
    case "active":
      return "Active note";
    case "outgoing":
      return "Outgoing link";
    case "backlink":
      return "Backlink";
    case "shared_tag":
      return "Shared tag";
    case "semantic":
      return "Hybrid/vector";
    default:
      return "Related";
  }
}

function nodeTone(kind: GraphSignalKind): {
  background: string;
  border: string;
  badge: string;
  label: string;
} {
  switch (kind) {
    case "active":
      return {
        background: "#e0f2fe",
        border: "#38bdf8",
        badge: "#0284c7",
        label: "Active note",
      };
    case "outgoing":
      return {
        background: "#eef2ff",
        border: "#818cf8",
        badge: "#4f46e5",
        label: "Outgoing link",
      };
    case "backlink":
      return {
        background: "#ecfdf5",
        border: "#34d399",
        badge: "#059669",
        label: "Backlink",
      };
    case "shared_tag":
      return {
        background: "#fff7ed",
        border: "#fb923c",
        badge: "#ea580c",
        label: "Shared tag",
      };
    case "semantic":
      return {
        background: "#faf5ff",
        border: "#c084fc",
        badge: "#7c3aed",
        label: "Semantic related",
      };
    default:
      return {
        background: "#f8fafc",
        border: "#cbd5e1",
        badge: "#475569",
        label: "Related note",
      };
  }
}

function edgeTone(
  kind: Exclude<GraphSignalKind, "active">
): Pick<Edge, "style" | "labelStyle" | "markerEnd" | "animated"> {
  switch (kind) {
    case "outgoing":
      return {
        animated: false,
        style: { stroke: "#6366f1", strokeWidth: 2 },
        labelStyle: { fill: "#4338ca", fontWeight: 600 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
      };
    case "backlink":
      return {
        animated: false,
        style: { stroke: "#10b981", strokeWidth: 2 },
        labelStyle: { fill: "#047857", fontWeight: 600 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
      };
    case "shared_tag":
      return {
        animated: false,
        style: {
          stroke: "#f97316",
          strokeWidth: 1.75,
          strokeDasharray: "6 4",
        },
        labelStyle: { fill: "#c2410c", fontWeight: 600 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
      };
    case "semantic":
      return {
        animated: true,
        style: {
          stroke: "#a855f7",
          strokeWidth: 1.75,
          strokeDasharray: "4 4",
        },
        labelStyle: { fill: "#7e22ce", fontWeight: 600 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a855f7" },
      };
    default:
      return {
        animated: false,
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        labelStyle: { fill: "#475569", fontWeight: 600 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      };
  }
}

function describeSelectedNode(details: GraphNodeDetails): string {
  if (details.primaryKind === "active") {
    return "This is the current note at the center of the graph. Select a neighboring node once to inspect why it is connected, then open it when you are ready.";
  }

  const kinds = details.relationKinds.filter(kind => kind !== "active");

  if (kinds.includes("outgoing") && kinds.includes("backlink")) {
    return "This note has two-way explicit markdown relationships with the active note.";
  }
  if (kinds.includes("outgoing")) {
    return "This note is explicitly linked from the active note through a wikilink or markdown link.";
  }
  if (kinds.includes("backlink")) {
    return "This note points back to the active note and helps explain why it appears in backlinks.";
  }
  if (kinds.includes("shared_tag")) {
    return "This note shares frontmatter tags with the active note and can be explored as a nearby topic cluster.";
  }
  if (kinds.includes("semantic")) {
    return "This note comes from hybrid/vector similarity and should be treated as a navigation hint rather than canonical linkage.";
  }

  return "This note is connected to the active note through a safe knowledge navigation signal.";
}

function describeEdgePreview(details: GraphEdgeDetails): string {
  switch (details.relationKind) {
    case "outgoing":
      return "This is an explicit markdown or wikilink path from the active note to a related note.";
    case "backlink":
      return "This edge shows another note pointing back to the active note through an explicit reference.";
    case "shared_tag":
      return "This edge comes from shared hashtags/frontmatter tags and helps reveal a nearby topic cluster.";
    case "semantic":
      return "This edge comes from hybrid/vector similarity and should be treated as a navigation hint, not canonical linkage.";
    default:
      return "This edge represents a safe navigation signal between notes.";
  }
}

export function KnowledgeGraphView(props: KnowledgeGraphViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(
    props.activeNote.libraryItemId
  );
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [filters, setFilters] = useState<RelationFilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    setSelectedNodeId(props.activeNote.libraryItemId);
    setHoveredEdgeId(null);
    setFilters(DEFAULT_FILTERS);
  }, [props.activeNote.libraryItemId]);

  const graph = useMemo(() => {
    const nodesById = new Map<number, GraphSignalNode>();
    const detailsById = new Map<number, GraphNodeDetails>();
    const edgeDetailsById = new Map<string, GraphEdgeDetails>();
    const allEdges: Array<
      Edge & { relationKind: Exclude<GraphSignalKind, "active"> }
    > = [];

    const upsertDetails = (
      node: GraphSignalNode,
      relationKind: GraphSignalKind,
      highlights: string[] = []
    ) => {
      const existing = detailsById.get(node.libraryItemId);
      if (!existing) {
        detailsById.set(node.libraryItemId, {
          libraryItemId: node.libraryItemId,
          title: node.title,
          logicalPath: node.logicalPath,
          primaryKind: relationKind,
          relationKinds: [relationKind],
          highlights: dedupeValues(highlights),
        });
        return;
      }

      existing.title = node.title;
      existing.logicalPath = node.logicalPath;
      existing.relationKinds = dedupeValues([
        ...existing.relationKinds,
        relationKind,
      ]) as GraphSignalKind[];
      existing.highlights = dedupeValues([
        ...existing.highlights,
        ...highlights,
      ]);

      if (
        relationKindPriority(relationKind) <
        relationKindPriority(existing.primaryKind)
      ) {
        existing.primaryKind = relationKind;
      }
    };

    const ensureNode = (node: GraphSignalNode) => {
      const existing = nodesById.get(node.libraryItemId);
      if (
        !existing ||
        relationKindPriority(node.kind) < relationKindPriority(existing.kind)
      ) {
        nodesById.set(node.libraryItemId, node);
      }
    };

    const activeNode: GraphSignalNode = {
      libraryItemId: props.activeNote.libraryItemId,
      title: props.activeNote.title,
      logicalPath: props.activeNote.logicalPath,
      kind: "active",
    };

    ensureNode(activeNode);
    upsertDetails(activeNode, "active", [
      `${props.backlinks.length} backlink(s)`,
      `${props.outgoing.length} outgoing link(s)`,
      `${props.sharedTags.length} shared-tag neighbor(s)`,
      `${props.semanticRelated.length} hybrid/vector suggestion(s)`,
    ]);

    for (const relation of props.outgoing) {
      if (!relation.libraryItemId || !relation.title) {
        continue;
      }

      const node: GraphSignalNode = {
        libraryItemId: relation.libraryItemId,
        title: relation.title,
        logicalPath: relation.logicalPath,
        kind: "outgoing",
      };
      ensureNode(node);
      upsertDetails(node, "outgoing", [
        relation.rawReference
          ? `Explicit link: ${relation.rawReference}`
          : "Explicit markdown link",
        relation.status ? `Status: ${relation.status}` : "",
      ]);
      const edgeId = `outgoing-${props.activeNote.libraryItemId}-${relation.libraryItemId}-${relation.rawReference ?? relation.title}`;
      allEdges.push({
        id: edgeId,
        source: String(props.activeNote.libraryItemId),
        target: String(relation.libraryItemId),
        label: "links to",
        relationKind: "outgoing",
        ...edgeTone("outgoing"),
      });
      edgeDetailsById.set(edgeId, {
        id: edgeId,
        relationKind: "outgoing",
        sourceTitle: props.activeNote.title,
        sourceLogicalPath: props.activeNote.logicalPath,
        targetTitle: relation.title,
        targetLogicalPath: relation.logicalPath,
        label: "links to",
        highlights: dedupeValues([
          relation.rawReference
            ? `Explicit link: ${relation.rawReference}`
            : "Explicit markdown link",
          relation.status ? `Status: ${relation.status}` : "",
        ]),
      });
    }

    for (const relation of props.backlinks) {
      if (!relation.libraryItemId || !relation.title) {
        continue;
      }

      const node: GraphSignalNode = {
        libraryItemId: relation.libraryItemId,
        title: relation.title,
        logicalPath: relation.logicalPath,
        kind: "backlink",
      };
      ensureNode(node);
      upsertDetails(node, "backlink", [
        relation.rawReference
          ? `Backlink reference: ${relation.rawReference}`
          : "Backlink mention",
        relation.status ? `Status: ${relation.status}` : "",
      ]);
      const edgeId = `backlink-${relation.libraryItemId}-${props.activeNote.libraryItemId}-${relation.rawReference ?? relation.title}`;
      allEdges.push({
        id: edgeId,
        source: String(relation.libraryItemId),
        target: String(props.activeNote.libraryItemId),
        label: "mentions here",
        relationKind: "backlink",
        ...edgeTone("backlink"),
      });
      edgeDetailsById.set(edgeId, {
        id: edgeId,
        relationKind: "backlink",
        sourceTitle: relation.title,
        sourceLogicalPath: relation.logicalPath,
        targetTitle: props.activeNote.title,
        targetLogicalPath: props.activeNote.logicalPath,
        label: "mentions here",
        highlights: dedupeValues([
          relation.rawReference
            ? `Backlink reference: ${relation.rawReference}`
            : "Backlink mention",
          relation.status ? `Status: ${relation.status}` : "",
        ]),
      });
    }

    for (const related of props.sharedTags) {
      const node: GraphSignalNode = {
        libraryItemId: related.libraryItemId,
        title: related.title,
        logicalPath: related.logicalPath,
        kind: "shared_tag",
      };
      ensureNode(node);
      upsertDetails(
        node,
        "shared_tag",
        related.sharedTags.map(tag => `#${tag}`)
      );
      const edgeId = `shared-tag-${props.activeNote.libraryItemId}-${related.libraryItemId}`;
      allEdges.push({
        id: edgeId,
        source: String(props.activeNote.libraryItemId),
        target: String(related.libraryItemId),
        label: related.sharedTags.slice(0, 2).join(", "),
        relationKind: "shared_tag",
        ...edgeTone("shared_tag"),
      });
      edgeDetailsById.set(edgeId, {
        id: edgeId,
        relationKind: "shared_tag",
        sourceTitle: props.activeNote.title,
        sourceLogicalPath: props.activeNote.logicalPath,
        targetTitle: related.title,
        targetLogicalPath: related.logicalPath,
        label: related.sharedTags.slice(0, 2).join(", "),
        highlights: dedupeValues(related.sharedTags.map(tag => `#${tag}`)),
      });
    }

    for (const related of props.semanticRelated) {
      const node: GraphSignalNode = {
        libraryItemId: related.libraryItemId,
        title: related.title,
        logicalPath: related.logicalPath,
        kind: "semantic",
      };
      ensureNode(node);
      upsertDetails(node, "semantic", [
        typeof related.score === "number"
          ? `Similarity ${(related.score * 100).toFixed(0)}%`
          : "Hybrid/vector related",
      ]);
      const edgeId = `semantic-${props.activeNote.libraryItemId}-${related.libraryItemId}`;
      allEdges.push({
        id: edgeId,
        source: String(props.activeNote.libraryItemId),
        target: String(related.libraryItemId),
        label:
          typeof related.score === "number"
            ? `semantic ${(related.score * 100).toFixed(0)}%`
            : "semantic",
        relationKind: "semantic",
        ...edgeTone("semantic"),
      });
      edgeDetailsById.set(edgeId, {
        id: edgeId,
        relationKind: "semantic",
        sourceTitle: props.activeNote.title,
        sourceLogicalPath: props.activeNote.logicalPath,
        targetTitle: related.title,
        targetLogicalPath: related.logicalPath,
        label:
          typeof related.score === "number"
            ? `semantic ${(related.score * 100).toFixed(0)}%`
            : "semantic",
        highlights: dedupeValues([
          typeof related.score === "number"
            ? `Similarity ${(related.score * 100).toFixed(0)}%`
            : "Hybrid/vector related",
        ]),
      });
    }

    const groups = {
      active: [] as GraphSignalNode[],
      backlink: [] as GraphSignalNode[],
      outgoing: [] as GraphSignalNode[],
      shared_tag: [] as GraphSignalNode[],
      semantic: [] as GraphSignalNode[],
    };

    const visibleNodeIds = new Set<number>();
    for (const node of nodesById.values()) {
      const details = detailsById.get(node.libraryItemId);
      const isVisible =
        node.kind === "active" ||
        details?.relationKinds.some(kind =>
          kind === "active" ? true : filters[kind]
        );

      if (!isVisible) {
        continue;
      }

      visibleNodeIds.add(node.libraryItemId);
      groups[node.kind].push(node);
    }

    const orderedNodes = [
      ...groups.active,
      ...groups.backlink.sort((a, b) => a.title.localeCompare(b.title)),
      ...groups.outgoing.sort((a, b) => a.title.localeCompare(b.title)),
      ...groups.shared_tag.sort((a, b) => a.title.localeCompare(b.title)),
      ...groups.semantic.sort((a, b) => a.title.localeCompare(b.title)),
    ];

    const nodeSpacingY = props.compact ? 120 : 150;
    const positionedNodes: Node[] = orderedNodes.map(node => {
      let x = 0;
      let y = 0;
      switch (node.kind) {
        case "active":
          x = 0;
          y = 0;
          break;
        case "backlink":
          x = -320;
          y =
            groups.backlink.findIndex(
              entry => entry.libraryItemId === node.libraryItemId
            ) *
              nodeSpacingY -
            ((groups.backlink.length - 1) * nodeSpacingY) / 2;
          break;
        case "outgoing":
          x = 320;
          y =
            groups.outgoing.findIndex(
              entry => entry.libraryItemId === node.libraryItemId
            ) *
              nodeSpacingY -
            ((groups.outgoing.length - 1) * nodeSpacingY) / 2;
          break;
        case "shared_tag":
          x = -140;
          y =
            240 +
            groups.shared_tag.findIndex(
              entry => entry.libraryItemId === node.libraryItemId
            ) *
              (props.compact ? 110 : 130);
          break;
        case "semantic":
          x = 160;
          y =
            240 +
            groups.semantic.findIndex(
              entry => entry.libraryItemId === node.libraryItemId
            ) *
              (props.compact ? 110 : 130);
          break;
        default:
          break;
      }

      const tone = nodeTone(node.kind);
      const isSelected = selectedNodeId === node.libraryItemId;

      return {
        id: String(node.libraryItemId),
        position: { x, y },
        draggable: false,
        connectable: false,
        selectable: true,
        selected: isSelected,
        style: {
          width: props.compact ? 220 : 240,
          borderRadius: 18,
          border: `${isSelected ? 2.5 : 1.5}px solid ${tone.border}`,
          background: tone.background,
          padding: 0,
          overflow: "hidden",
          boxShadow: isSelected
            ? "0 18px 36px rgba(14, 116, 144, 0.22)"
            : "0 10px 20px rgba(15, 23, 42, 0.08)",
        },
        data: {
          title: node.title,
          label: (
            <div className="px-3 py-3">
              <div
                className="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                style={{ backgroundColor: tone.badge }}
              >
                {tone.label}
              </div>
              <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
                {node.title}
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                {node.logicalPath ?? "No logical path"}
              </div>
              {isSelected ? (
                <div className="mt-2 text-[11px] font-medium text-sky-700">
                  Inspecting selection
                </div>
              ) : null}
            </div>
          ),
        },
      };
    });

    const edges = allEdges
      .filter(
        edge =>
          filters[edge.relationKind] &&
          visibleNodeIds.has(Number.parseInt(edge.source, 10)) &&
          visibleNodeIds.has(Number.parseInt(edge.target, 10))
      )
      .map(edge =>
        edge.id === hoveredEdgeId
          ? {
              ...edge,
              animated: true,
              style: {
                ...edge.style,
                strokeWidth:
                  typeof edge.style?.strokeWidth === "number"
                    ? edge.style.strokeWidth + 1
                    : 3,
              },
              labelStyle: {
                ...edge.labelStyle,
                fontWeight: 700,
              },
            }
          : edge
      );

    return {
      nodes: positionedNodes,
      edges,
      detailsById,
      edgeDetailsById,
      counts: {
        backlink: props.backlinks.length,
        outgoing: props.outgoing.length,
        shared_tag: props.sharedTags.length,
        semantic: props.semanticRelated.length,
      },
    };
  }, [
    filters,
    props.activeNote,
    props.backlinks,
    props.compact,
    props.outgoing,
    props.semanticRelated,
    props.sharedTags,
    selectedNodeId,
    hoveredEdgeId,
  ]);

  useEffect(() => {
    const selectedNodeVisible = graph.nodes.some(
      node => node.id === String(selectedNodeId)
    );
    if (!selectedNodeVisible) {
      setSelectedNodeId(props.activeNote.libraryItemId);
    }
  }, [graph.nodes, props.activeNote.libraryItemId, selectedNodeId]);

  useEffect(() => {
    if (!hoveredEdgeId) {
      return;
    }
    const hoveredEdgeVisible = graph.edges.some(
      edge => edge.id === hoveredEdgeId
    );
    if (!hoveredEdgeVisible) {
      setHoveredEdgeId(null);
    }
  }, [graph.edges, hoveredEdgeId]);

  const selectedDetails = graph.detailsById.get(selectedNodeId) ??
    graph.detailsById.get(props.activeNote.libraryItemId) ?? {
      libraryItemId: props.activeNote.libraryItemId,
      title: props.activeNote.title,
      logicalPath: props.activeNote.logicalPath,
      primaryKind: "active" as const,
      relationKinds: ["active" as const],
      highlights: [],
    };
  const hoveredEdgeDetails = hoveredEdgeId
    ? (graph.edgeDetailsById.get(hoveredEdgeId) ?? null)
    : null;

  const hasVisibleNeighbors = graph.nodes.length > 1;
  const selectedTone = nodeTone(selectedDetails.primaryKind);
  const canResetFilters = Object.values(filters).some(value => !value);

  if (
    props.outgoing.length === 0 &&
    props.backlinks.length === 0 &&
    props.sharedTags.length === 0 &&
    props.semanticRelated.length === 0
  ) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
        No safe relationships have been mapped yet. Add wikilinks, internal
        markdown links, tags, or richer note structure to light up the graph.
      </div>
    );
  }

  return (
    <div
      className={
        props.fillAvailable
          ? "flex h-full min-h-0 flex-col gap-3"
          : "space-y-3"
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {(
          [
            {
              key: "backlink",
              label: "Backlinks",
              tone: "bg-emerald-500",
              count: graph.counts.backlink,
            },
            {
              key: "outgoing",
              label: "Outgoing",
              tone: "bg-indigo-500",
              count: graph.counts.outgoing,
            },
            {
              key: "shared_tag",
              label: "Shared tags",
              tone: "bg-orange-500",
              count: graph.counts.shared_tag,
            },
            {
              key: "semantic",
              label: "Hybrid/vector",
              tone: "bg-violet-500",
              count: graph.counts.semantic,
            },
          ] as const
        ).map(entry => (
          <button
            key={entry.key}
            type="button"
            className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors ${
              filters[entry.key]
                ? "border-slate-200 bg-white text-slate-700"
                : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
            onClick={() =>
              setFilters(current => ({
                ...current,
                [entry.key]: !current[entry.key],
              }))
            }
          >
            <span className={`h-2.5 w-2.5 rounded-full ${entry.tone}`} />
            {entry.label}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {entry.count}
            </span>
          </button>
        ))}

        {canResetFilters ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset filters
          </Button>
        ) : null}
      </div>

      <div
        className={
          props.fillAvailable
            ? "relative min-h-[420px] flex-1 rounded-2xl border border-slate-200 bg-white"
            : props.compact
            ? "relative h-[320px] rounded-2xl border border-slate-200 bg-white"
            : "relative h-[520px] rounded-3xl border border-slate-200 bg-white"
        }
      >
        {hoveredEdgeDetails ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 sm:inset-x-auto sm:right-3 sm:w-[320px]">
            <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl shadow-slate-200/70 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="rounded-full text-white"
                  style={{
                    backgroundColor: nodeTone(hoveredEdgeDetails.relationKind)
                      .badge,
                  }}
                >
                  {relationKindLabel(hoveredEdgeDetails.relationKind)}
                </Badge>
                <Badge variant="outline" className="rounded-full bg-white/90">
                  Edge preview
                </Badge>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {hoveredEdgeDetails.sourceTitle} {"->"}{" "}
                {hoveredEdgeDetails.targetTitle}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                {hoveredEdgeDetails.sourceLogicalPath ?? "No logical path"}{" "}
                {"->"}{" "}
                {hoveredEdgeDetails.targetLogicalPath ?? "No logical path"}
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                {describeEdgePreview(hoveredEdgeDetails)}
              </div>
              {hoveredEdgeDetails.highlights.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {hoveredEdgeDetails.highlights.slice(0, 4).map(highlight => (
                    <Badge
                      key={`${hoveredEdgeDetails.id}-${highlight}`}
                      variant="outline"
                      className="rounded-full bg-white/90 text-slate-600"
                    >
                      {highlight}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          minZoom={0.3}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onPaneClick={() => {
            setSelectedNodeId(props.activeNote.libraryItemId);
            setHoveredEdgeId(null);
          }}
          onNodeClick={(_, node) => {
            const itemId = Number.parseInt(node.id, 10);
            const title =
              typeof node.data?.title === "string"
                ? node.data.title
                : props.activeNote.title;

            if (selectedNodeId === itemId) {
              props.onOpenItem(itemId, title);
              return;
            }

            setHoveredEdgeId(null);
            setSelectedNodeId(itemId);
          }}
          onNodeDoubleClick={(_, node) => {
            const itemId = Number.parseInt(node.id, 10);
            const title =
              typeof node.data?.title === "string"
                ? node.data.title
                : props.activeNote.title;
            props.onOpenItem(itemId, title);
          }}
          onEdgeMouseEnter={(_, edge) => {
            setHoveredEdgeId(edge.id);
          }}
          onEdgeMouseLeave={(_, edge) => {
            setHoveredEdgeId(current => (current === edge.id ? null : current));
          }}
          className="rounded-3xl"
          proOptions={{ hideAttribution: true }}
        >
          {!props.compact ? (
            <>
              <Controls className="border border-slate-200 bg-white shadow-sm" />
              <MiniMap
                pannable
                zoomable
                className="border border-slate-200 bg-white"
                nodeColor={node => {
                  const details = graph.detailsById.get(Number(node.id));
                  return details
                    ? nodeTone(details.primaryKind).badge
                    : "#94a3b8";
                }}
              />
            </>
          ) : null}
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="#cbd5e1"
          />
        </ReactFlow>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="rounded-full text-white"
                  style={{ backgroundColor: selectedTone.badge }}
                >
                  {relationKindLabel(selectedDetails.primaryKind)}
                </Badge>
                {selectedDetails.relationKinds
                  .filter(kind => kind !== selectedDetails.primaryKind)
                  .map(kind => (
                    <Badge
                      key={`${selectedDetails.libraryItemId}-${kind}`}
                      variant="outline"
                      className="rounded-full bg-white/90"
                    >
                      {relationKindLabel(kind)}
                    </Badge>
                  ))}
              </div>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {selectedDetails.title}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                {selectedDetails.logicalPath ?? "No logical path recorded yet."}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                Click once to inspect
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
                Click again to open
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
            {describeSelectedNode(selectedDetails)}
          </div>

          {selectedDetails.highlights.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedDetails.highlights.slice(0, 6).map(highlight => (
                <Badge
                  key={`${selectedDetails.libraryItemId}-${highlight}`}
                  variant="outline"
                  className="rounded-full bg-white/90 text-slate-600"
                >
                  {highlight.startsWith("#") ? (
                    <Tag className="mr-1 h-3 w-3 text-orange-600" />
                  ) : highlight.includes("Similarity") ? (
                    <Sparkles className="mr-1 h-3 w-3 text-violet-600" />
                  ) : highlight.toLowerCase().includes("link") ||
                    highlight.toLowerCase().includes("reference") ? (
                    <Link2 className="mr-1 h-3 w-3 text-indigo-600" />
                  ) : (
                    <GitBranch className="mr-1 h-3 w-3 text-sky-600" />
                  )}
                  {highlight}
                </Badge>
              ))}
            </div>
          ) : null}

          {!hasVisibleNeighbors ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              Current filters hide every relationship. Turn some signals back on
              to repopulate the graph.
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-stretch">
          <Button
            type="button"
            variant="outline"
            className="rounded-full lg:justify-start"
            onClick={() => setSelectedNodeId(props.activeNote.libraryItemId)}
          >
            <GitBranch className="mr-2 h-4 w-4" />
            Focus active note
          </Button>
          <Button
            type="button"
            className="rounded-full bg-sky-600 text-white hover:bg-sky-700 lg:justify-start"
            onClick={() =>
              props.onOpenItem(
                selectedDetails.libraryItemId,
                selectedDetails.title
              )
            }
          >
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Open selected note
          </Button>
        </div>
      </div>
    </div>
  );
}

export default KnowledgeGraphView;
