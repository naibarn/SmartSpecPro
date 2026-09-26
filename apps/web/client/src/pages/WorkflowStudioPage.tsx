import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useLocation, useRoute } from "wouter";
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
  useUpdateNodeInternals,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeHandle,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Copy,
  Database,
  FileText,
  FolderOpen,
  GripVertical,
  GitBranch,
  Library,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  WandSparkles,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppPage } from "@/components/AppPage";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  addWorkflowPreset,
  buildInitialWorkflowGraph,
  deleteWorkflowNode,
  duplicateWorkflowNode,
  fromSemanticWorkflowDefinition,
  projectCanonicalNodePresets,
  toSemanticWorkflowDefinition,
  validateWorkflowConnection,
  WORKFLOW_NODE_PRESETS,
  type WorkflowGraphNode,
  type WorkflowGraphNodeData,
  type WorkflowGraphState,
  type WorkflowNodeKind,
} from "./workflowStudioGraph";

type StudioSurface = "builder" | "subflow" | "library" | "marketplace";
type RunState = "idle" | "validation_error" | "checking" | "admitted" | "error";
type DrawerTab =
  "output" | "data" | "trace" | "logs" | "artifacts" | "cost" | "errors";

const DRAWER_TABS: Array<[DrawerTab, string]> = [
  ["output", "studio.output"],
  ["data", "studio.data"],
  ["trace", "studio.trace"],
  ["logs", "studio.logs"],
  ["artifacts", "studio.artifacts"],
  ["cost", "studio.cost"],
  ["errors", "studio.errors"],
];

function nodeIcon(kind: WorkflowNodeKind) {
  switch (kind) {
    case "input":
      return FileText;
    case "analysis":
      return Database;
    case "approval":
      return ShieldCheck;
    case "output":
      return CircleCheck;
    case "media":
      return Workflow;
    default:
      return Sparkles;
  }
}

function nodeTone(kind: WorkflowNodeKind) {
  switch (kind) {
    case "input":
      return {
        border: "border-sky-300",
        rail: "bg-sky-500",
        icon: "text-sky-600",
      };
    case "analysis":
      return {
        border: "border-cyan-300",
        rail: "bg-cyan-500",
        icon: "text-cyan-600",
      };
    case "agent":
      return {
        border: "border-violet-300",
        rail: "bg-violet-500",
        icon: "text-violet-600",
      };
    case "media":
      return {
        border: "border-indigo-300",
        rail: "bg-indigo-500",
        icon: "text-indigo-600",
      };
    case "approval":
      return {
        border: "border-amber-300",
        rail: "bg-amber-500",
        icon: "text-amber-600",
      };
    default:
      return {
        border: "border-emerald-300",
        rail: "bg-emerald-500",
        icon: "text-emerald-600",
      };
  }
}

type WorkflowFlowNodeData = WorkflowGraphNodeData & {
  onOpenSubflow?: () => void;
};

function WorkflowFlowNode({
  id,
  data,
  selected,
}: NodeProps<Node<WorkflowFlowNodeData>>) {
  const { t } = useTranslation("workflow");
  const updateNodeInternals = useUpdateNodeInternals();
  const Icon = nodeIcon(data.kind);
  const tone = nodeTone(data.kind);
  const inputs = data.inputs ?? [{ name: "input", type: "any" }];
  const outputs = data.outputs ?? [{ name: "output", type: "any" }];
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      updateNodeInternals(id);
      return;
    }
    const frame = window.requestAnimationFrame(() => updateNodeInternals(id));
    return () => window.cancelAnimationFrame(frame);
  }, [id, inputs.length, outputs.length, updateNodeInternals]);
  return (
    <article
      data-testid={`workflow-node-${data.kind}`}
      tabIndex={0}
      aria-label={`${t("studio.selectNode")} ${data.label}`}
      className={`relative min-w-[250px] rounded-xl border bg-card px-4 py-3 text-left shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tone.border} ${selected ? "ring-2 ring-primary/30" : "hover:shadow-lg"}`}
    >
      {inputs.map((port, index) => (
        <Handle
          key={`target-${port.name}`}
          id={`${port.name}:${port.type}`}
          type="target"
          position={Position.Left}
          style={{ top: `${32 + index * 20}px` }}
          className="!h-3 !w-3 !border-2 !border-background !bg-slate-500"
          aria-label={`${port.name} ${port.type}`}
        />
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={`source-${port.name}`}
          id={`${port.name}:${port.type}`}
          type="source"
          position={Position.Right}
          style={{ top: `${32 + index * 20}px` }}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
          aria-label={`${port.name} ${port.type}`}
        />
      ))}
      <span
        className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${tone.rail}`}
        aria-hidden="true"
      />
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className={`size-4 shrink-0 ${tone.icon}`} aria-hidden="true" />
          <span className="truncate">{data.label}</span>
        </span>
        <MoreHorizontal
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
      <span className="mt-2 block text-sm leading-5 text-muted-foreground">
        {data.description}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={data.flowType === "subflow" ? "default" : "outline"} className="px-1.5 py-0 text-[10px]">
          {data.flowType === "subflow" ? "Subflow" : "Main flow"}
        </Badge>
        {data.category ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{data.category}</Badge> : null}
      </span>
      {data.outputs?.length ? (
        <span className="mt-2 block border-t pt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Outputs</span>{" "}
          {data.outputs.map(port => `${port.name} · ${port.type}`).join(", ")}
        </span>
      ) : null}
      {data.outputPreview && Object.keys(data.outputPreview).length ? (
        <span className="mt-2 block rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          {Object.entries(data.outputPreview).slice(0, 2).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}
        </span>
      ) : null}
      {data.flowType === "subflow" && data.onOpenSubflow ? (
        <Button type="button" size="sm" variant="outline" className="nodrag mt-2 h-8 w-full text-sm" onClick={event => { event.stopPropagation(); data.onOpenSubflow?.(); }}>
          <GitBranch className="size-3.5" /> Open subflow
        </Button>
      ) : null}
      <span className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
        <span
          className="size-1.5 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        {t("studio.ready")}
      </span>
    </article>
  );
}

function workflowNodeHandles(node: WorkflowGraphNode): NodeHandle[] {
  const width = node.width ?? 260;
  const handleSize = 12;
  const inputs = node.data.inputs ?? [{ name: "input", type: "any" }];
  const outputs = node.data.outputs ?? [{ name: "output", type: "any" }];
  return [
    ...inputs.map((port, index) => ({
      id: `${port.name}:${port.type}`,
      type: "target" as const,
      position: Position.Left,
      x: -handleSize / 2,
      y: 32 + index * 20 - handleSize / 2,
      width: handleSize,
      height: handleSize,
    })),
    ...outputs.map((port, index) => ({
      id: `${port.name}:${port.type}`,
      type: "source" as const,
      position: Position.Right,
      x: width - handleSize / 2,
      y: 32 + index * 20 - handleSize / 2,
      width: handleSize,
      height: handleSize,
    })),
  ];
}

const workflowNodeTypes = { workflow: WorkflowFlowNode };

function CanvasInternalsRefresh({ nodeIds }: { nodeIds: string[] }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeIdKey = nodeIds.join("|");
  useEffect(() => {
    const refresh = () => updateNodeInternals(nodeIds);
    const timer = window.setTimeout(refresh, 80);
    return () => window.clearTimeout(timer);
  }, [nodeIdKey, updateNodeInternals]);
  return null;
}

function CanvasDropBridge({
  onPresetDrop,
}: {
  onPresetDrop: (presetId: string, position: { x: number; y: number }) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".workflow-studio-flow");
    if (!canvas) return;
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("application/workflow-preset")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      const presetId = event.dataTransfer?.getData("application/workflow-preset");
      if (!presetId) return;
      event.preventDefault();
      onPresetDrop(presetId, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    };
    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("drop", onDrop);
    return () => {
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
    };
  }, [onPresetDrop, screenToFlowPosition]);
  return null;
}

function StudioNavigation({
  surface,
  onSurface,
}: {
  surface: StudioSurface;
  onSurface: (next: StudioSurface) => void;
}) {
  const { t } = useTranslation("workflow");
  const items: Array<{
    id: StudioSurface;
    icon: typeof WandSparkles;
    label: string;
  }> = [
    { id: "builder", icon: WandSparkles, label: t("studio.builder") },
    { id: "library", icon: Library, label: t("studio.library") },
    { id: "marketplace", icon: Sparkles, label: t("studio.marketplace") },
  ];
  const activeSurface = surface === "subflow" ? "builder" : surface;
  return (
    <nav
      data-testid="workflow-studio-top-navigation"
      aria-label="Workflow studio navigation"
      className="border-b bg-background/95 px-3 py-2 shadow-sm backdrop-blur"
    >
      <div className="flex min-h-11 items-center gap-3 overflow-x-auto">
        <p className="shrink-0 pr-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          SmartAIHub
        </p>
        <div className="flex min-w-0 items-center gap-1">
          {items.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              aria-current={activeSurface === id ? "page" : undefined}
              onClick={() => onSurface(id)}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeSurface === id ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

const NODE_CATEGORY_ORDER: WorkflowNodeCategory[] = [
  "agent",
  "skill",
  "flow",
  "logic",
  "ui",
  "tool",
  "ai",
];

function WorkflowNodePalette({
  presets,
  onAddPreset,
}: {
  presets: typeof WORKFLOW_NODE_PRESETS;
  onAddPreset: (presetId: string) => void;
}) {
  const { t } = useTranslation("workflow");
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<WorkflowNodeCategory>>(
    () => new Set(NODE_CATEGORY_ORDER)
  );
  const normalizedQuery = query.trim().toLowerCase();
  const groups = useMemo(() => {
    return NODE_CATEGORY_ORDER.map(category => ({
      category,
      presets: presets.filter(preset => {
        if (preset.category !== category) return false;
        if (!normalizedQuery) return true;
        return `${preset.label} ${preset.description} ${preset.id} ${preset.typeId}`
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    })).filter(group => group.presets.length > 0);
  }, [normalizedQuery, presets]);

  const toggleCategory = (category: WorkflowNodeCategory) => {
    setExpandedCategories(current => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <aside
      data-testid="workflow-studio-node-palette"
      aria-label="Workflow node palette"
      className="flex max-h-80 min-h-0 flex-col border-b bg-muted/10 p-3 lg:max-h-none lg:border-b-0 lg:border-r"
    >
      <header className="shrink-0">
        <div className="flex items-start justify-between gap-2">
          <span>
            <p className="text-sm font-semibold text-foreground">
              {t("studio.nodePalette")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("studio.nodePaletteHint")}
            </p>
          </span>
          <Badge variant="secondary" className="shrink-0">
            {presets.length}
          </Badge>
        </div>
        <label className="relative mt-3 block" htmlFor="workflow-node-type-search">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="workflow-node-type-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="h-10 pl-9"
            placeholder={t("studio.searchNodeTypes")}
            aria-label={t("studio.searchNodeTypes")}
          />
        </label>
      </header>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {groups.length ? (
          groups.map(group => {
            const expanded = normalizedQuery.length > 0 || expandedCategories.has(group.category);
            return (
              <section key={group.category} className="rounded-lg border bg-background/70">
                <button
                  type="button"
                  aria-label={t(`studio.nodeCategory.${group.category}`)}
                  aria-expanded={expanded}
                  onClick={() => toggleCategory(group.category)}
                  className="flex min-h-10 w-full items-center justify-between gap-2 px-3 text-left text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span>{t(`studio.nodeCategory.${group.category}`)}</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{group.presets.length}</span>
                    <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </span>
                </button>
                {expanded ? (
                  <div className="grid gap-1 border-t p-1.5">
                    {group.presets.map(preset => {
                      const Icon = nodeIcon(preset.kind);
                      const tone = nodeTone(preset.kind);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-label={preset.label}
                          draggable
                          onDragStart={event => event.dataTransfer.setData("application/workflow-preset", preset.id)}
                          onClick={() => onAddPreset(preset.id)}
                          title={preset.description}
                          className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span className={`flex size-7 shrink-0 items-center justify-center rounded-md bg-muted ${tone.icon}`}>
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{preset.label}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{preset.typeId}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t("studio.noMatchingNodeTypes")}
          </p>
        )}
      </div>
    </aside>
  );
}

function CatalogSurface({
  surface,
  onSurface,
  onOpen,
}: {
  surface: "library" | "marketplace";
  onSurface: (next: StudioSurface) => void;
  onOpen: (definitionId: string, versionId?: string, appId?: string) => void;
}) {
  const { t } = useTranslation("workflow");
  const [search, setSearch] = useState("");
  const libraryQuery = trpc.workflowStudio.list.useQuery(undefined, {
    enabled: surface === "library",
  });
  const marketplaceQuery = trpc.workflowStudio.marketplace.useQuery(undefined, {
    enabled: surface === "marketplace",
  });
  const query = surface === "library" ? libraryQuery : marketplaceQuery;
  const cards = useMemo(() => {
    const raw =
      surface === "library"
        ? (libraryQuery.data ?? []).map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            status: item.status,
            meta: item.currentVersionNumber
              ? `v${item.currentVersionNumber}`
              : t("studio.draft"),
            versionId: undefined,
            appId: undefined,
          }))
        : (marketplaceQuery.data ?? []).map(item => ({
            id: item.definitionId,
            name: item.name,
            description: item.description,
            status: t("studio.published"),
            meta: item.slug,
            versionId: item.versionId,
            appId: item.id,
          }));
    const needle = search.trim().toLowerCase();
    return needle
      ? raw.filter(card =>
          `${card.name} ${card.description ?? ""} ${card.meta}`
            .toLowerCase()
            .includes(needle)
        )
      : raw;
  }, [libraryQuery.data, marketplaceQuery.data, search, surface, t]);
  const title =
    surface === "library" ? t("studio.library") : t("studio.marketplace");
  return (
    <AppPage
      title={title}
      description={
        surface === "library"
          ? t("studio.libraryDescription")
          : t("studio.marketplaceDescription")
      }
      breadcrumbs={[{ label: t("studio.builder") }, { label: title }]}
      constrainToParent
      actions={
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => window.location.assign("/dashboard")}><ArrowLeft className="size-4" /> {t("studio.backToDashboard")}</Button>
          <LocaleToggle />
          <Button onClick={() => onSurface("builder")}><Plus className="size-4" />{t("studio.newWorkflow")}</Button>
        </span>
      }
    >
      <StudioNavigation surface={surface} onSurface={onSurface} />
      <main
        data-testid={`workflow-studio-${surface}`}
        className="min-h-[42rem] bg-muted/20 p-3"
      >
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <span>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {surface === "library"
                  ? t("studio.libraryEyebrow")
                  : t("studio.marketplaceEyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{title}</h2>
            </span>
            <label
              className="relative block min-w-56"
              htmlFor="workflow-catalog-search"
            >
              <Search
                className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="workflow-catalog-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="pl-9"
                placeholder={t("studio.search")}
              />
            </label>
          </header>
          {query.isLoading ? (
            <p
              className="flex items-center gap-2 py-10 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("studio.loading")}
            </p>
          ) : query.isError ? (
            <section
              className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
              role="alert"
            >
              <p className="font-medium">{t("studio.catalogError")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void query.refetch()}
              >
                <RefreshCw className="size-4" />
                {t("studio.retry")}
              </Button>
            </section>
          ) : cards.length === 0 ? (
            <section className="mt-5 rounded-xl border border-dashed p-10 text-center">
              <FolderOpen
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">
                {search
                  ? t("studio.noSearchResults")
                  : surface === "library"
                    ? t("studio.emptyLibrary")
                    : t("studio.emptyMarketplace")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {surface === "library"
                  ? t("studio.emptyLibraryDetail")
                  : t("studio.emptyMarketplaceDetail")}
              </p>
            </section>
          ) : (
            <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cards.map(card => (
                <li
                  key={`${card.id}-${card.versionId ?? "draft"}`}
                  className="rounded-xl border bg-background p-4"
                >
                  <span className="flex items-start justify-between gap-3">
                    <Workflow
                      className="size-5 text-primary"
                      aria-hidden="true"
                    />
                    <Badge variant="outline">{card.status}</Badge>
                  </span>
                  <h3 className="mt-4 font-semibold">{card.name}</h3>
                  <p className="mt-1 min-h-10 text-sm text-muted-foreground">
                    {card.description || t("studio.noDescription")}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {card.meta}
                  </p>
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    onClick={() => onOpen(card.id, card.versionId, card.appId)}
                  >
                    {t("studio.openWorkflow")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppPage>
  );
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(value))
    .then(buffer =>
      Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("")
    );
}

function RunSurface({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation("workflow");
  const definitionId = new URLSearchParams(window.location.search).get(
    "definitionId"
  );
  const marketplaceAppId = new URLSearchParams(window.location.search).get(
    "marketplaceAppId"
  );
  const getQuery = trpc.workflowStudio.get.useQuery(
    definitionId
      ? { id: definitionId }
      : { id: "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(definitionId) }
  );
  const marketplaceQuery = trpc.workflowStudio.marketplaceDetail.useQuery(
    { appId: marketplaceAppId ?? undefined },
    { enabled: Boolean(marketplaceAppId) }
  );
  const runMutation = trpc.workflowStudio.run.useMutation();
  const controlMutation = trpc.workflowStudio.controlRun.useMutation();
  const initialRunId = new URLSearchParams(window.location.search).get("runId");
  const [runId, setRunId] = useState(initialRunId ?? "");
  const runQuery = trpc.workflowStudio.getRun.useQuery(
    { runId },
    {
      enabled: Boolean(runId),
      refetchInterval: runId ? 2000 : false,
    }
  );
  const [input, setInput] = useState("");
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState("2 minutes");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [editingStyle, setEditingStyle] = useState("Cinematic");
  const [mode, setMode] = useState<
    "full" | "run_until" | "run_from" | "run_node" | "run_subflow"
  >("full");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [checkpointId, setCheckpointId] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [message, setMessage] = useState("");
  const [runDrawerTab, setRunDrawerTab] = useState<
    "output" | "data" | "trace" | "logs" | "artifacts"
  >("trace");
  const submit = async () => {
    if ((!definitionId && !marketplaceAppId) || !input.trim()) {
      setRunState("validation_error");
      setMessage(t("studio.validationError"));
      return;
    }
    setRunState("checking");
    try {
      const result = await runMutation.mutateAsync({
        definitionId:
          definitionId ?? marketplaceQuery.data?.definition.id ?? "",
        versionId:
          getQuery.data?.versions?.[0]?.id ??
          marketplaceQuery.data?.version.id ??
          "",
        contentHash:
          getQuery.data?.versions?.[0]?.contentHash ??
          marketplaceQuery.data?.version.contentHash ??
          "",
        ...(marketplaceAppId ? { marketplaceAppId } : {}),
        input: {
          document: input,
          goal: input,
          videos: videoFiles.map(file => ({ name: file.name, size: file.size, type: file.type })),
          references: referenceFiles.map(file => ({ name: file.name, size: file.size, type: file.type })),
          duration,
          aspectRatio,
          editingStyle,
        },
        mode,
        ...(targetNodeId ? { targetNodeId } : {}),
        ...(checkpointId ? { checkpointId } : {}),
        idempotencyKey: `studio-${definitionId}-${Date.now()}`,
      });
      setRunState("admitted");
      setRunId(result.runId);
      setMessage(`${t("studio.admitted")}: ${result.runId}`);
    } catch (error) {
      setRunState("error");
      setMessage(
        error instanceof Error ? error.message : t("studio.runtimeUnavailable")
      );
    }
  };
  const controlRun = async (
    action:
      "approve" | "reject" | "submit_input" | "retry" | "cancel" | "resume"
  ) => {
    if (!runId) return;
    try {
      const result = await controlMutation.mutateAsync({
        runId,
        action,
        expectedRunRevision: runQuery.data?.run.runRevision ?? 0,
        actionId: `studio-${action}-${Date.now()}`,
        input: { document: input, goal: input },
      });
      setMessage(`${t("studio.controlAccepted")}: ${result.status}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("studio.controlError")
      );
    }
  };
  const definition = getQuery.data?.semanticDefinitionJson;
  const nodes =
    definition &&
    typeof definition === "object" &&
    Array.isArray((definition as { nodes?: unknown }).nodes)
      ? (definition as { nodes: Array<{ id: string }> }).nodes
      : [];
  const runTargets = nodes.length
    ? nodes
    : (marketplaceQuery.data?.targets ?? []).map(node => ({ id: node.id }));
  return (
    <AppPage
      title={t("studio.run")}
      description={t("studio.workflowSubtitle")}
      breadcrumbs={[{ label: t("studio.builder") }, { label: t("studio.run") }]}
      constrainToParent
      actions={
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => window.location.assign("/dashboard")}><ArrowLeft className="size-4" /> {t("studio.backToDashboard")}</Button>
          <LocaleToggle />
          <Button variant="outline" onClick={onBack}><ArrowLeft className="size-4" />{t("studio.builder")}</Button>
        </span>
      }
    >
      <main
        data-testid="workflow-studio-run"
        className="grid min-h-[42rem] gap-4 bg-muted/20 p-3 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]"
      >
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <header className="flex items-center justify-between">
            <span>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t("studio.miniApp")}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {marketplaceQuery.data?.definition.name ??
                  getQuery.data?.definition.name ??
                  t("studio.workflowTitle")}
              </h2>
            </span>
            <Badge variant="outline">
              {(marketplaceQuery.data?.version.versionNumber ??
              getQuery.data?.definition.currentVersionNumber)
                ? `v${getQuery.data.definition.currentVersionNumber}`
                : "draft"}
            </Badge>
          </header>
          <div className="mt-5 flex items-center justify-between gap-2 border-b pb-4">
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={t("studio.runTabs")}>
              {(["run", "activity", "versions", "analytics"] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={tab === "run"} className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${tab === "run" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{t(`studio.${tab}`)}</button>)}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setMessage(t("studio.presetLoaded"))}>{t("studio.loadPreset")}</Button>
          </div>
          {runId ? (
            <section className="border-b px-4 py-3" aria-label="Run controls">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {String(runQuery.data?.run.status ?? runState)}
                </Badge>
                <span className="text-xs text-muted-foreground">{runId}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controlMutation.isPending}
                  onClick={() => void controlRun("approve")}
                >
                  {t("studio.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controlMutation.isPending}
                  onClick={() => void controlRun("resume")}
                >
                  {t("studio.resume")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controlMutation.isPending}
                  onClick={() => void controlRun("retry")}
                >
                  {t("studio.retryRun")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controlMutation.isPending}
                  onClick={() => void controlRun("cancel")}
                >
                  {t("studio.cancelRun")}
                </Button>
              </div>
              {message ? (
                <p className="mt-2 text-xs text-muted-foreground" role="status">
                  {message}
                </p>
              ) : null}
            </section>
          ) : null}
          <label
            className="mt-5 block text-sm font-medium"
            htmlFor="workflow-run-input"
          >
            {t("studio.input")}
            <textarea
              id="workflow-run-input"
              value={input}
              onChange={event => {
                setInput(event.target.value);
                setRunState("idle");
              }}
              className="mt-2 min-h-36 w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder={t("studio.inputHint")}
            />
          </label>
          <section className="mt-4 grid gap-3">
            <label className="block text-sm font-medium" htmlFor="workflow-run-videos">{t("studio.videos")}
              <input id="workflow-run-videos" className="mt-2 block w-full rounded-lg border border-dashed bg-background p-3 text-sm" type="file" accept="video/*" multiple onChange={event => setVideoFiles(Array.from(event.target.files ?? []))} />
            </label>
            {videoFiles.length ? <p className="text-xs text-muted-foreground">{videoFiles.map(file => file.name).join(", ")}</p> : null}
            <label className="block text-sm font-medium" htmlFor="workflow-run-references">{t("studio.referenceImages")}
              <input id="workflow-run-references" className="mt-2 block w-full rounded-lg border border-dashed bg-background p-3 text-sm" type="file" accept="image/*" multiple onChange={event => setReferenceFiles(Array.from(event.target.files ?? []))} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">{t("studio.maximumDuration")}<select value={duration} onChange={event => setDuration(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option>2 minutes</option><option>5 minutes</option><option>10 minutes</option></select></label>
              <label className="block text-sm font-medium">{t("studio.aspectRatio")}<select value={aspectRatio} onChange={event => setAspectRatio(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
            </div>
            <label className="block text-sm font-medium">{t("studio.editingStyle")}<select value={editingStyle} onChange={event => setEditingStyle(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option>Cinematic</option><option>Modern</option><option>Social Media</option><option>Documentary</option><option>Custom</option></select></label>
          </section>
          <label
            className="mt-4 block text-sm font-medium"
            htmlFor="workflow-run-mode"
          >
            {t("studio.runMode")}
            <select
              id="workflow-run-mode"
              value={mode}
              onChange={event => setMode(event.target.value as typeof mode)}
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="full">{t("studio.fullRun")}</option>
              <option value="run_until">{t("studio.runUntil")}</option>
              <option value="run_from">{t("studio.runFrom")}</option>
              <option value="run_node">{t("studio.runNode")}</option>
              <option value="run_subflow">{t("studio.runSubflow")}</option>
            </select>
          </label>
          {mode !== "full" ? (
            <label
              className="mt-4 block text-sm font-medium"
              htmlFor="workflow-run-target"
            >
              {t("studio.targetNode")}
              <select
                id="workflow-run-target"
                value={targetNodeId}
                onChange={event => setTargetNodeId(event.target.value)}
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("studio.selectTarget")}</option>
                {runTargets.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {mode === "run_from" ? (
            <label
              className="mt-4 block text-sm font-medium"
              htmlFor="workflow-run-checkpoint"
            >
              {t("studio.checkpointId")}
              <Input
                id="workflow-run-checkpoint"
                value={checkpointId}
                onChange={event => setCheckpointId(event.target.value)}
                className="mt-2"
                placeholder={t("studio.checkpointHint")}
              />
            </label>
          ) : null}
          <Button
            className="mt-5 w-full"
            onClick={() => void submit()}
            disabled={runState === "checking"}
          >
            <Play className="size-4" />
            {runState === "checking"
              ? t("studio.checking")
              : t("studio.runWorkflow")}
          </Button>
          {message ? (
            <p
              className={`mt-3 rounded-lg border p-3 text-xs ${runState === "error" || runState === "validation_error" ? "border-destructive/40 bg-destructive/5" : "border-emerald-500/40 bg-emerald-500/10"}`}
              role={
                runState === "error" || runState === "validation_error"
                  ? "alert"
                  : "status"
              }
            >
              {message}
            </p>
          ) : null}
        </section>
        <section
          aria-live="polite"
          aria-labelledby="run-progress-title"
          className="grid gap-4 lg:grid-rows-[auto_minmax(0,1fr)]"
        >
          <header className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("studio.runStatus")}</p>
                <h2 id="run-progress-title" className="mt-1 text-lg font-semibold">{runId ? `Run #${runId.slice(0, 8)}` : t("studio.waitingForRun")}</h2>
              </span>
              <span className="flex flex-wrap gap-2">
                {runId ? <>
                  <Button size="sm" variant="outline" disabled={controlMutation.isPending} onClick={() => void controlRun("cancel")}>{t("studio.cancelRun")}</Button>
                  <Button size="sm" variant="outline" disabled={controlMutation.isPending} onClick={() => void controlRun("retry")}>{t("studio.retryFailedStep")}</Button>
                  <Button size="sm" variant="outline" onClick={() => setRunDrawerTab("trace")}>{t("studio.openDebug")}</Button>
                </> : null}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{runState === "admitted" ? t("studio.admitted") : t("studio.waitingForRun")}</p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-4">
              {["input", "analyze", "produce", "approval"].map(
                (step, index) => (
                  <li key={step} className="flex items-center gap-2 text-xs">
                    <span className="flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground">
                      {index + 1}
                    </span>
                    <span>{t(`studio.steps.${step}`)}</span>
                  </li>
                )
              )}
            </ol>
          </header>
          <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm md:grid-cols-2">
            <article>
              <h3 className="text-sm font-semibold">{t("studio.activity")}</h3>
              <p className="mt-3 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                {runState === "admitted"
                  ? t("studio.runAdmittedDetail")
                  : t("studio.noRunActivity")}
              </p>
            </article>
            <article>
              <h3 className="text-sm font-semibold">
                {t("studio.latestPreview")}
              </h3>
              <section className="mt-3 flex min-h-32 items-center justify-center rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                {t("studio.noArtifacts")}
              </section>
            </article>
          </section>
        </section>
        <section
          aria-label="Workflow run and debug drawer"
          className="border-t bg-card lg:col-span-2"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Terminal className="size-4 text-primary" aria-hidden="true" />
              {t("studio.runDebug")}
              <Badge variant="outline">
                {String(runQuery.data?.run.status ?? runState)}
              </Badge>
            </span>
            <span className="text-xs text-muted-foreground">
              {runId || t("studio.waitingForRun")}
            </span>
          </header>
          <Tabs
            value={runDrawerTab}
            onValueChange={value => setRunDrawerTab(value as typeof runDrawerTab)}
          >
            <TabsList className="mx-4 mb-3 grid w-fit grid-cols-5 gap-1">
              {(["output", "data", "trace", "logs", "artifacts"] as const).map(
                tab => (
                  <TabsTrigger key={tab} value={tab}>
                    {t(`studio.${tab}`)}
                  </TabsTrigger>
                )
              )}
            </TabsList>
            {(["output", "data", "trace", "logs", "artifacts"] as const).map(
              tab => (
                <TabsContent
                  key={tab}
                  value={tab}
                  className="border-t px-4 py-4 text-xs text-muted-foreground"
                >
                  {runQuery.data ? (
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(
                        tab === "output"
                          ? (runQuery.data.run.outputJson ?? {})
                          : tab === "data"
                            ? (runQuery.data.run.inputJson ?? {})
                            : tab === "trace"
                              ? runQuery.data.events
                              : tab === "logs"
                                ? runQuery.data.jobs.flatMap(job =>
                                    Array.isArray(job.recentEvents)
                                      ? job.recentEvents
                                      : []
                                  )
                                : runQuery.data.jobs.flatMap(job =>
                                    Array.isArray(job.artifacts)
                                      ? job.artifacts
                                      : []
                                  ),
                        null,
                        2
                      )}
                    </pre>
                  ) : (
                    t(
                      tab === "output"
                        ? "studio.drawerNoOutput"
                        : tab === "data"
                          ? "studio.drawerNoData"
                          : tab === "trace"
                            ? "studio.drawerNoTrace"
                            : tab === "logs"
                              ? "studio.drawerNoLogs"
                              : "studio.noArtifacts"
                    )
                  )}
                </TabsContent>
              )
            )}
          </Tabs>
        </section>
      </main>
    </AppPage>
  );
}

function updateNode(
  graphNodes: WorkflowGraphNode[],
  nodeId: string,
  updater: (node: WorkflowGraphNode) => WorkflowGraphNode
) {
  return graphNodes.map(node => (node.id === nodeId ? updater(node) : node));
}

function PortEditor({
  label,
  ports,
  onChange,
}: {
  label: string;
  ports: Array<{ name: string; type: string }>;
  onChange: (ports: Array<{ name: string; type: string }>) => void;
}) {
  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onChange([...ports, { name: `field${ports.length + 1}`, type: "any" }])}><Plus className="size-3.5" /> Add</Button>
      </div>
      <div className="mt-2 grid gap-2">
        {ports.length ? ports.map((port, index) => (
          <div key={`${port.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
            <Input aria-label={`${label} ${index + 1} name`} value={port.name} onChange={event => onChange(ports.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
            <Input aria-label={`${label} ${index + 1} type`} value={port.type} onChange={event => onChange(ports.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} />
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${port.name}`} onClick={() => onChange(ports.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></Button>
          </div>
        )) : <p className="text-xs text-muted-foreground">No fields</p>}
      </div>
    </section>
  );
}

function SkillSchemaFields({
  schema,
  value,
  onChange,
}: {
  schema: unknown;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const raw = schema && typeof schema === "object" ? schema as Record<string, unknown> : {};
  const properties = raw.properties && typeof raw.properties === "object"
    ? raw.properties as Record<string, Record<string, unknown>>
    : raw.sections && typeof raw.sections === "object"
      ? Object.values(raw.sections as Record<string, unknown>).reduce<Record<string, Record<string, unknown>>>((acc, section) => {
          if (section && typeof section === "object" && "fields" in section && Array.isArray((section as { fields?: unknown }).fields)) {
            for (const field of (section as { fields: Array<Record<string, unknown>> }).fields) if (field.name) acc[String(field.name)] = field;
          }
          return acc;
        }, {})
      : {};
  const entries = Object.entries(properties);
  if (!entries.length) return null;
  return (
    <div className="grid gap-3">
      <p className="text-xs font-semibold">Skill inputs</p>
      {entries.map(([name, field]) => {
        const type = String(field.type ?? "string");
        const current = value[name] ?? field.default ?? "";
        const options = Array.isArray(field.enum) ? field.enum.map(String) : [];
        return (
          <label key={name} className="block text-sm font-medium" htmlFor={`skill-input-${name}`}>
            {String(field.title ?? name)}
            {options.length ? (
              <select id={`skill-input-${name}`} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={String(current)} onChange={event => onChange({ ...value, [name]: event.target.value })}>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
            ) : type === "boolean" ? (
              <input id={`skill-input-${name}`} className="ml-2 size-4" type="checkbox" checked={Boolean(current)} onChange={event => onChange({ ...value, [name]: event.target.checked })} />
            ) : type === "number" || type === "integer" ? (
              <Input id={`skill-input-${name}`} className="mt-1" type="number" value={String(current)} onChange={event => onChange({ ...value, [name]: Number(event.target.value) })} />
            ) : (
              <Input id={`skill-input-${name}`} className="mt-1" value={String(current)} onChange={event => onChange({ ...value, [name]: event.target.value })} />
            )}
          </label>
        );
      })}
    </div>
  );
}

function BuilderSurface({
  surface,
  onSurface,
  onRun,
}: {
  surface: "builder" | "subflow";
  onSurface: (next: StudioSurface) => void;
  onRun: (definitionId?: string) => void;
}) {
  const { t } = useTranslation("workflow");
  const [, setLocation] = useLocation();
  const definitionIdFromUrl = new URLSearchParams(window.location.search).get(
    "definitionId"
  );
  const definitionQuery = trpc.workflowStudio.get.useQuery(
    definitionIdFromUrl
      ? { id: definitionIdFromUrl }
      : { id: "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(definitionIdFromUrl) }
  );
  const createDraftMutation = trpc.workflowStudio.createDraft.useMutation();
  const saveDraftMutation = trpc.workflowStudio.saveDraft.useMutation();
  const publishVersionMutation =
    trpc.workflowStudio.publishVersion.useMutation();
  const generateDraftMutation = trpc.workflowStudio.generateDraft.useMutation();
  const editDraftMutation = trpc.workflowStudio.editDraft.useMutation();
  const skillsQuery = trpc.skills.listForWorkflow.useQuery(undefined, {
    enabled: true,
  });
  const nodeTypesQuery = trpc.workflowStudio.nodeTypes.useQuery(undefined);
  const nodePresets = useMemo(
    () => projectCanonicalNodePresets(nodeTypesQuery.data ?? []),
    [nodeTypesQuery.data]
  );
  const [graph, setGraph] = useState<WorkflowGraphState>(() =>
    buildInitialWorkflowGraph()
  );
  const [selectedNodeId, setSelectedNodeId] = useState("analyze-assets");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("output");
  const [inspectorTab, setInspectorTab] = useState("configure");
  const [builderTab, setBuilderTab] = useState("build");
  const [notice, setNotice] = useState("");
  const [propertyError, setPropertyError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedRevision, setSavedRevision] = useState(0);
  const [persistedDefinitionId, setPersistedDefinitionId] = useState(
    definitionIdFromUrl ?? ""
  );
  const [notes, setNotes] = useState("");
  const [inspectorWidth, setInspectorWidth] = useState(360);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"draft" | "edit">("draft");
  const selected =
    graph.nodes.find(node => node.id === selectedNodeId) ?? graph.nodes[0];
  const selectedEdge = graph.edges.find(edge => edge.id === selectedEdgeId);
  const subflow = surface === "subflow";
  const selectedSkillId = selected?.data.skillId ?? "";
  const skillSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedSkillId },
    { enabled: Boolean(selectedSkillId) }
  );

  useEffect(() => {
    if (
      !definitionQuery.data?.semanticDefinitionJson ||
      typeof definitionQuery.data.semanticDefinitionJson !== "object"
    )
      return;
    const restored = fromSemanticWorkflowDefinition(
      definitionQuery.data.semanticDefinitionJson as Parameters<
        typeof fromSemanticWorkflowDefinition
      >[0]
    );
    setGraph(restored);
    setSelectedNodeId(restored.nodes[0]?.id ?? "");
    setSavedRevision(definitionQuery.data.definition.draftRevision ?? 0);
    setDirty(false);
  }, [definitionQuery.data]);

  const markGraphChanged = useCallback((next: WorkflowGraphState) => {
    setGraph(next);
    setDirty(true);
    setNotice("");
  }, []);
  const openSubflow = useCallback(
    (parentId = "video-production") => {
      const existingChild = graph.nodes.find(
        node => node.data.subflowParentId === parentId
      );
      setGraph(current => {
        const existing = current.nodes.filter(
          node => node.data.flowType === "subflow" && node.data.subflowParentId === parentId
        );
        if (existing.length) {
          return { ...current, activeFlowId: existing[0].data.subflowId ?? parentId, activeFlowType: "subflow", activeSubflowParentId: parentId };
        }
        const seed = ["ai-agent", "flow-router", "human-approval"] as const;
        let next = current;
        const added: WorkflowGraphNode[] = [];
        seed.forEach((presetId, index) => {
          const result = addWorkflowPreset(next, presetId, { x: 260, y: 80 + index * 180 });
          const node = {
            ...result.node,
            id: `${parentId}::${result.node.id}`,
            data: {
              ...result.node.data,
              flowType: "subflow" as const,
              subflowId: `${parentId}-subflow`,
              subflowParentId: parentId,
            },
          };
          next = {
            ...result.graph,
            nodes: result.graph.nodes.filter(item => item.id !== result.node.id).concat(node),
          };
          added.push(node);
        });
        const childEdges = added.slice(1).map((node, index) => ({
          id: `${added[index].id}->${node.id}`,
          source: added[index].id,
          target: node.id,
          sourceHandle: `${added[index].data.outputs?.[0]?.name ?? "output"}:${added[index].data.outputs?.[0]?.type ?? "any"}`,
          targetHandle: `${node.data.inputs?.[0]?.name ?? "input"}:${node.data.inputs?.[0]?.type ?? "any"}`,
          type: "smoothstep",
          markerEnd: { type: "arrowclosed" as const },
          style: { stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 },
        }));
        return {
          ...next,
          edges: [...next.edges, ...childEdges],
          activeFlowId: `${parentId}-subflow`,
          activeFlowType: "subflow",
          activeSubflowParentId: parentId,
        };
      });
      setSelectedNodeId(existingChild?.id ?? `${parentId}::agent-8`);
      setSelectedEdgeId(null);
      setDirty(true);
      onSurface("subflow");
    },
    [graph.nodes, onSurface]
  );
  const exitSubflow = useCallback(() => {
    setGraph(current => ({ ...current, activeFlowId: "main", activeFlowType: "main", activeSubflowParentId: undefined }));
    setSelectedEdgeId(null);
    setSelectedNodeId("video-production");
    onSurface("builder");
  }, [onSurface]);
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 1) return;
      setInspectorWidth(Math.max(300, Math.min(620, window.innerWidth - event.clientX)));
    };
    const onPointerUp = () => document.body.classList.remove("cursor-col-resize");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);
  const onNodesChange = useCallback(
    (
      changes: Array<{
        type: string;
        id?: string;
        position?: { x: number; y: number };
        selected?: boolean;
      }>
    ) => {
      setGraph(current => ({
        ...current,
        nodes: current.nodes
          .filter(node => !changes.some(change => change.type === "remove" && change.id === node.id))
          .map(node => {
            const change = changes.find(item => item.id === node.id);
            if (!change) return node;
            if (change.type === "position" && change.position)
              return { ...node, position: change.position };
            if (change.type === "select")
              return { ...node, selected: change.selected };
            return node;
          }),
        edges: current.edges.filter(edge =>
          !changes.some(change => change.type === "remove" && (change.id === edge.source || change.id === edge.target))
        ),
      }));
      if (
        changes.some(
          change => change.type === "position" || change.type === "remove"
        )
      )
        setDirty(true);
    },
    []
  );
  const onNodesDelete = useCallback((deleted: WorkflowGraphNode[]) => {
    const deletedIds = new Set(deleted.map(node => node.id));
    setGraph(current => ({
      ...current,
      nodes: current.nodes.filter(node => !deletedIds.has(node.id)),
      edges: current.edges.filter(edge => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)),
    }));
    setSelectedNodeId(current => deletedIds.has(current) ? "" : current);
    setSelectedEdgeId(null);
    setDirty(true);
  }, []);
  const onConnect = useCallback(
    (connection: Connection) => {
      const error = validateWorkflowConnection(connection, graph);
      if (error) {
        setNotice(error.message);
        return;
      }
      const nextEdge: Edge = {
        ...connection,
        id: `${connection.source}-${connection.target}-${Date.now()}`,
        type: "smoothstep",
        markerEnd: { type: "arrowclosed" },
        style: { stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 },
      };
      markGraphChanged({ ...graph, edges: addEdge(nextEdge, graph.edges) });
      setSelectedEdgeId(nextEdge.id);
    },
    [graph, markGraphChanged]
  );
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const deletedIds = new Set(deleted.map(edge => edge.id));
    setGraph(current => ({ ...current, edges: current.edges.filter(edge => !deletedIds.has(edge.id)) }));
    setSelectedEdgeId(current => current && deletedIds.has(current) ? null : current);
    setDirty(true);
  }, []);
  const nudgeSelected = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (
        !selected ||
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      const delta = event.shiftKey ? 20 : 5;
      const dx =
        event.key === "ArrowLeft"
          ? -delta
          : event.key === "ArrowRight"
            ? delta
            : 0;
      const dy =
        event.key === "ArrowUp"
          ? -delta
          : event.key === "ArrowDown"
            ? delta
            : 0;
      markGraphChanged({
        ...graph,
        nodes: updateNode(graph.nodes, selected.id, node => ({
          ...node,
          position: { x: node.position.x + dx, y: node.position.y + dy },
        })),
      });
    },
    [graph, markGraphChanged, selected]
  );
  const addNode = () => {
    const node = addWorkflowPreset(graph, "ai-agent");
    markGraphChanged(node.graph);
    setSelectedNodeId(node.node.id);
  };
  const addPreset = (presetId: string, position?: { x: number; y: number }) => {
    const result = addWorkflowPreset(graph, presetId, position);
    markGraphChanged(result.graph);
    setSelectedNodeId(result.node.id);
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const next = duplicateWorkflowNode(graph, selected.id);
    markGraphChanged(next);
    setSelectedNodeId(
      next.nodes.find(node => node.selected)?.id ?? selected.id
    );
  };
  const deleteSelected = () => {
    if (!selected) return;
    markGraphChanged(deleteWorkflowNode(graph, selected.id));
    setSelectedNodeId(
      graph.nodes.find(node => node.id !== selected.id)?.id ?? ""
    );
  };
  const updateSelectedData = (patch: Partial<WorkflowGraphNodeData>) => {
    if (selected)
      markGraphChanged({
        ...graph,
        nodes: updateNode(graph.nodes, selected.id, node => ({
          ...node,
          data: { ...node.data, ...patch },
        })),
      });
  };
  const updateSelectedConfig = (key: string, value: unknown) => {
    if (selected)
      updateSelectedData({ config: { ...selected.data.config, [key]: value } });
  };
  const saveDraft = async (): Promise<string | null> => {
    const definition = toSemanticWorkflowDefinition(graph, savedRevision);
    try {
      if (persistedDefinitionId) {
        const saved = await saveDraftMutation.mutateAsync({
          definitionId: persistedDefinitionId,
          expectedRevision: savedRevision,
          definition,
          name: "Workflow Studio",
        });
        setSavedRevision(saved.draftRevision);
        setDirty(false);
        setNotice(t("studio.saved"));
        return persistedDefinitionId;
      }
      const created = await createDraftMutation.mutateAsync({
        name: "Workflow Studio",
        description: t("studio.workflowSubtitle"),
        definition,
        miniAppSchema: {},
      });
      setPersistedDefinitionId(created.id);
      setSavedRevision(created.draftRevision ?? 0);
      setDirty(false);
      setNotice(t("studio.saved"));
      setLocation(`/studio/workflow?definitionId=${created.id}`);
      return created.id;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("studio.saveError"));
      return null;
    }
  };
  const publish = async () => {
    const id = await saveDraft();
    if (!id) return;
    try {
      const semanticDefinition = toSemanticWorkflowDefinition(
        graph,
        savedRevision + 1
      );
      const contentHash = await sha256Hex(JSON.stringify(semanticDefinition));
      const result = await publishVersionMutation.mutateAsync({
        definitionId: id,
        versionNumber: definitionQuery.data?.definition.currentVersionNumber
          ? definitionQuery.data.definition.currentVersionNumber + 1
          : 1,
        contentHash,
        semanticDefinition,
        inputSchema: {},
        outputSchema: {},
      });
      setNotice(`${t("studio.published")}: v${result.versionNumber}`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("studio.publishError")
      );
    }
  };
  const improveWithAi = async () => {
    try {
      const result = await (aiMode === "draft" ? generateDraftMutation : editDraftMutation).mutateAsync({
        intent: aiPrompt.trim() || t("studio.improvePrompt"),
        options: graph.nodes.map(node => ({
          id: node.data.kind,
          ready: true,
          reasonCode: "ready",
        })),
      });
      const candidate = result.candidate as Parameters<typeof fromSemanticWorkflowDefinition>[0];
      if (aiMode === "draft") {
        const next = fromSemanticWorkflowDefinition(candidate);
        markGraphChanged(next);
        setSelectedNodeId(next.nodes[1]?.id ?? next.nodes[0]?.id ?? "");
        setNotice(`${t("studio.aiDraftReady")}: ${result.selectedOptionId}`);
      } else {
        const target = selected?.id;
        const next = target
          ? updateNode(graph.nodes, target, node => ({
              ...node,
              data: { ...node.data, description: aiPrompt.trim() || result.selectedOptionId, config: { ...node.data.config, aiInstruction: aiPrompt.trim() || result.selectedOptionId } },
            }))
          : graph.nodes;
        markGraphChanged({ ...graph, nodes: next });
        setNotice(`${t("studio.aiFlowUpdated")}: ${result.selectedOptionId}`);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("studio.aiUnavailable")
      );
    }
  };
  const handleRun = async () => {
    const id = persistedDefinitionId || (await saveDraft());
    if (id) onRun(id);
    else setNotice(t("studio.saveBeforeRun"));
  };
  const graphStatus = propertyError ? "blocked" : dirty ? "dirty" : "saved";
  const visibleNodes = graph.nodes
    .filter(node => subflow
      ? node.data.subflowParentId === (graph.activeSubflowParentId ?? "video-production")
      : !node.data.subflowParentId)
    .map(node => ({
      ...node,
      type: "workflow",
      handles: workflowNodeHandles(node),
      data: {
        ...node.data,
        onOpenSubflow: node.data.flowType === "subflow" ? () => openSubflow(node.id) : undefined,
      },
    }));
  const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
  const visibleEdges = graph.edges.filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  return (
    <AppPage
      title={t("studio.workflowTitle")}
      description={t("studio.workflowSubtitle")}
      breadcrumbs={[
        { label: t("studio.builder") },
        { label: subflow ? t("studio.subflow") : t("studio.workflowTitle") },
      ]}
      constrainToParent
      actions={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            <Check className="size-3 text-emerald-600" />
            {t(`studio.${graphStatus}`)}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="size-4" /> {t("studio.backToDashboard")}
          </Button>
          <LocaleToggle />
          <Button
            variant="outline"
            onClick={() => subflow
              ? exitSubflow()
              : openSubflow(selected?.data.flowType === "subflow" ? selected.id : undefined)}
          >
            <GitBranch className="size-4" />
            {subflow ? t("studio.builder") : t("studio.subflow")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void publish()}
            disabled={
              publishVersionMutation.isPending || Boolean(propertyError)
            }
          >
            {publishVersionMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {t("studio.publish")}
          </Button>
          <Button onClick={() => void handleRun()}>
            <Play className="size-4" />
            {t("studio.run")}
          </Button>
        </span>
      }
    >
      <StudioNavigation surface={surface} onSurface={onSurface} />
      <main
        data-testid="workflow-studio-builder"
        className="overflow-hidden rounded-xl border bg-background shadow-sm"
      >
        <section
          className="grid min-h-[42rem] lg:grid-cols-[18rem_minmax(0,1fr)_0.5rem_var(--inspector-width)]"
          style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
        >
          <WorkflowNodePalette presets={nodePresets} onAddPreset={presetId => addPreset(presetId)} />
          <section
            className="relative flex min-h-[42rem] min-w-0 flex-col bg-[radial-gradient(hsl(var(--muted-foreground)/0.15)_1px,transparent_1px)] [background-size:22px_22px]"
            aria-label="Top-down workflow canvas"
          >
            <header className="border-b bg-background/90 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  {t("studio.editorReady")}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="size-2 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  {t("studio.semanticVersion")}
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </span>
              </div>
              {subflow ? (
                  <h2 className="mt-3 text-lg font-semibold">
                  {t("studio.nodes.storyboard")} <span className="text-sm font-normal text-muted-foreground">/ {t("studio.subflowOf")} {graph.activeSubflowParentId ?? "video-production"}</span>
                </h2>
              ) : null}
              <div
                className="mt-3 flex gap-1 overflow-x-auto"
                role="tablist"
                aria-label={t("studio.builderTabs")}
              >
                {["build", "test", "runs", "analytics", "versions"].map(tab => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={builderTab === tab}
                    onClick={() => setBuilderTab(tab)}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${builderTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {t(`studio.${tab}`)}
                  </button>
                ))}
              </div>
            </header>
            {builderTab === "build" ? (
              <section className="relative flex min-h-[34rem] flex-1 overflow-hidden">
                <ReactFlowProvider>
                  <ReactFlow
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    nodeTypes={workflowNodeTypes}
                    onNodesChange={onNodesChange as never}
                    onNodesDelete={onNodesDelete as never}
                    onNodeClick={(_, node) => {
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId(null);
                    }}
                    onNodeDragStop={(_, node) => {
                      setGraph(current => ({
                        ...current,
                        nodes: current.nodes.map(item =>
                          item.id === node.id
                            ? { ...item, position: node.position }
                            : item
                        ),
                      }));
                      setDirty(true);
                    }}
                    onNodeDoubleClick={(_, node) => {
                      if (node.data.flowType === "subflow") openSubflow(node.id);
                    }}
                    onConnect={onConnect}
                    onEdgeClick={(_, edge) => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId("");
                    }}
                    onEdgesDelete={onEdgesDelete}
                    deleteKeyCode={["Backspace", "Delete"]}
                    defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: "arrowclosed" }, style: { stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 } }}
                    connectionLineStyle={{ stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 }}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    className="workflow-studio-flow min-h-[34rem]"
                  >
                    <Background
                      variant={BackgroundVariant.Dots}
                      gap={22}
                      size={1}
                      color="hsl(var(--muted-foreground) / 0.18)"
                    />
                    <MiniMap pannable zoomable className="!bg-card" />
                    <Controls showZoom showFitView showInteractive={false} className="!left-4 !top-4 !bottom-auto" />
                    <CanvasDropBridge onPresetDrop={addPreset} />
                    <CanvasInternalsRefresh nodeIds={visibleNodes.map(node => node.id)} />
                  </ReactFlow>
                </ReactFlowProvider>
                {notice ? (
                  <p
                    className="absolute bottom-4 left-4 right-4 z-20 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
                    role="status"
                  >
                    {notice}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className="flex min-h-[34rem] flex-1 flex-col justify-center p-8">
                <div className="rounded-xl border bg-card p-6 shadow-sm">
                  <h2 className="text-lg font-semibold">
                    {t(`studio.${builderTab}Title`)}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {builderTab === "test"
                      ? t("studio.testDetail")
                      : builderTab === "runs"
                        ? t("studio.runsDetail")
                        : builderTab === "analytics"
                          ? t("studio.analyticsDetail")
                          : t("studio.versionsDetail")}
                  </p>
                  {builderTab === "test" ? (
                    <Button
                      className="mt-4"
                      onClick={() =>
                        setNotice(
                          propertyError
                            ? t("studio.propertiesInvalid")
                            : t("studio.preflightReady")
                        )
                      }
                    >
                      <Check className="size-4" />
                      {t("studio.preflight")}
                    </Button>
                  ) : builderTab === "runs" ? (
                    <Button className="mt-4" onClick={() => void handleRun()}>
                      <Play className="size-4" />
                      {t("studio.run")}
                    </Button>
                  ) : null}
                </div>
              </section>
            )}
            {builderTab === "build" ? (
              <section className="border-t bg-card/95 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t("studio.aiBuilder")}</Badge>
                  <Input aria-label={t("studio.aiPrompt")} value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} placeholder={t("studio.aiPromptPlaceholder")} className="min-w-56 flex-1" />
                  <select aria-label={t("studio.aiMode")} value={aiMode} onChange={event => setAiMode(event.target.value as typeof aiMode)} className="h-10 rounded-md border bg-background px-3 text-sm">
                    <option value="draft">{t("studio.aiDraft")}</option>
                    <option value="edit">{t("studio.aiEdit")}</option>
                  </select>
                  <Button type="button" variant="outline" onClick={() => void improveWithAi()} disabled={generateDraftMutation.isPending || editDraftMutation.isPending}>
                    <WandSparkles className="size-4" /> {t("studio.generateWithAI")}
                  </Button>
                </div>
              </section>
            ) : null}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {t("studio.nodeSummary", {
                  count: graph.nodes.length,
                  connections: graph.edges.length,
                })}
              </span>
              <span className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={addNode}>
                  <Plus className="size-4" />
                  {t("studio.addNode")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={duplicateSelected}
                  disabled={!selected}
                >
                  <Copy className="size-4" />
                  {t("studio.duplicateNode")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deleteSelected}
                  disabled={!selected}
                >
                  <Trash2 className="size-4" />
                  {t("studio.deleteNode")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectorTab("settings")}
                >
                  <Settings2 className="size-4" />
                  {t("studio.canvasSettings")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void saveDraft()}
                  disabled={
                    !dirty ||
                    saveDraftMutation.isPending ||
                    createDraftMutation.isPending
                  }
                >
                  {saveDraftMutation.isPending ||
                  createDraftMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {t("studio.saveDraft")}
                </Button>
              </span>
            </footer>
          </section>
          <button
            type="button"
            aria-label={t("studio.resizeInspector")}
            className="hidden w-2 cursor-col-resize items-center justify-center border-l bg-muted/30 hover:bg-primary/20 lg:flex"
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
              document.body.classList.add("cursor-col-resize");
            }}
          >
            <GripVertical className="size-4 text-muted-foreground" />
          </button>
          <aside
            aria-label="Selected node inspector"
            className="border-l bg-card p-4 max-lg:border-t max-lg:border-l-0"
          >
            <header className="flex items-start justify-between">
              <span>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {selectedEdge
                    ? t("studio.selectedEdge")
                    : t("studio.selectedNode")}
                </p>
                <h2 className="mt-1 text-base font-semibold">
                  {selectedEdge
                    ? `${selectedEdge.source} → ${selectedEdge.target}`
                    : (selected?.data.label ?? t("studio.noSelection"))}
                </h2>
              </span>
              {selected ? (
                <Badge variant="outline">{selected.data.kind}</Badge>
              ) : null}
            </header>
            <Tabs
              value={inspectorTab}
              onValueChange={setInspectorTab}
              className="mt-5"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="configure">
                  {t("studio.configure")}
                </TabsTrigger>
                <TabsTrigger value="settings">
                  {t("studio.settings")}
                </TabsTrigger>
                <TabsTrigger value="notes">{t("studio.notes")}</TabsTrigger>
              </TabsList>
              <TabsContent value="configure" className="mt-4 space-y-4">
                {selectedEdge ? (
                  <>
                    <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      {t("studio.edgeSelected")}
                    </p>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        setGraph(current => ({
                          ...current,
                          edges: current.edges.filter(
                            edge => edge.id !== selectedEdge.id
                          ),
                        }));
                        setSelectedEdgeId(null);
                        setDirty(true);
                      }}
                    >
                      <Trash2 className="size-4" />
                      {t("studio.deleteEdge")}
                    </Button>
                  </>
                ) : selected ? (
                  <>
                    {subflow ? (
                      <section className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <p>{t("studio.compatibleSources")}</p>
                        <ul className="mt-2 grid gap-1">
                          <li>
                            <span>input.document.text</span> · string
                          </li>
                          <li>
                            <span>extract.content</span> · string
                          </li>
                        </ul>
                      </section>
                    ) : null}
                    <label
                      className="block text-sm font-medium"
                      htmlFor="workflow-node-label"
                    >
                      {t("studio.nodeLabel")}
                      <Input
                        id="workflow-node-label"
                        className="mt-2"
                        value={selected.data.label}
                        onChange={event =>
                          updateSelectedData({ label: event.target.value })
                        }
                        onKeyDown={nudgeSelected}
                      />
                    </label>
                    <label className="block text-sm font-medium" htmlFor="workflow-node-preset">
                      {t("studio.nodePreset")}
                      <select id="workflow-node-preset" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={String(selected.data.presetId ?? "")} onChange={event => {
                        const preset = nodePresets.find(item => item.id === event.target.value);
                        if (preset) {
                          markGraphChanged({
                            ...graph,
                            nodes: updateNode(graph.nodes, selected.id, node => ({
                              ...node,
                              type: preset.kind,
                              data: {
                                ...node.data,
                                presetId: preset.id,
                                typeId: preset.typeId,
                                typeVersion: preset.typeVersion,
                                ...(preset.binding ? { binding: structuredClone(preset.binding) } : { binding: undefined }),
                                category: preset.category,
                                kind: preset.kind,
                                description: preset.description,
                                inputs: preset.inputs,
                                outputs: preset.outputs,
                                flowType: preset.flowType,
                                subflowId: preset.subflowId,
                                config: { ...selected.data.config, ...preset.config },
                              },
                            })),
                          });
                        }
                      }}>
                        <option value="">{t("studio.customNode")}</option>
                        {nodePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                      </select>
                    </label>
                    {selected.data.typeId === "core.capability" || selected.data.typeId === "data.retrieval" ? (
                      <section className="space-y-3 rounded-lg border bg-muted/20 p-3">
                        <label className="block text-sm font-medium" htmlFor="workflow-skill-id">
                          {t("studio.skill")}
                          <select id="workflow-skill-id" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedSkillId} onChange={event => updateSelectedData({ skillId: event.target.value, config: { ...selected.data.config, skillId: event.target.value, skillInput: {} } })}>
                            <option value="">{t("studio.selectSkill")}</option>
                            {(skillsQuery.data?.skills ?? []).map(skill => <option key={skill.id} value={skill.slug}>{skill.name}</option>)}
                          </select>
                        </label>
                        {skillSchemaQuery.data?.hasSchema ? (
                          <SkillSchemaFields schema={skillSchemaQuery.data.schema} value={(selected.data.config.skillInput ?? {}) as Record<string, unknown>} onChange={value => updateSelectedConfig("skillInput", value)} />
                        ) : selectedSkillId ? <p className="text-xs text-muted-foreground">{t("studio.skillSchemaUnavailable")}</p> : null}
                      </section>
                    ) : null}
                    <label
                      className="block text-sm font-medium"
                      htmlFor="workflow-node-capability"
                    >
                      {t("studio.capability")}
                      <Input
                        id="workflow-node-capability"
                        className="mt-2"
                        value={String(
                          selected.data.config.capability ?? selected.data.kind
                        )}
                        onChange={event =>
                          updateSelectedConfig("capability", event.target.value)
                        }
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-sm font-medium">
                        {t("studio.retryLimit")}
                        <Input
                          className="mt-2"
                          type="number"
                          min={0}
                          max={10}
                          value={String(
                            selected.data.config.retryMaxAttempts ?? 1
                          )}
                          onChange={event =>
                            updateSelectedConfig(
                              "retryMaxAttempts",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        {t("studio.timeoutSeconds")}
                        <Input
                          className="mt-2"
                          type="number"
                          min={1}
                          max={86400}
                          value={String(
                            selected.data.config.timeoutSeconds ?? 3600
                          )}
                          onChange={event =>
                            updateSelectedConfig(
                              "timeoutSeconds",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                    </div>
                    {selected.data.kind === "approval" ? (
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={selected.data.config.required !== false}
                          onChange={event =>
                            updateSelectedConfig(
                              "required",
                              event.target.checked
                            )
                          }
                        />
                        {t("studio.requireApproval")}
                      </label>
                    ) : null}
                    {selected.data.kind === "output" ? (
                      <label
                        className="block text-sm font-medium"
                        htmlFor="workflow-output-key"
                      >
                        {t("studio.outputMapping")}
                        <Input
                          id="workflow-output-key"
                          className="mt-2"
                          value={String(
                            selected.data.config.outputKey ?? "result"
                          )}
                          onChange={event =>
                            updateSelectedConfig(
                              "outputKey",
                              event.target.value
                            )
                          }
                        />
                      </label>
                    ) : null}
                    <div className="grid gap-3">
                      <PortEditor label={t("studio.inputPorts")} ports={selected.data.inputs ?? []} onChange={inputs => updateSelectedData({ inputs })} />
                      <PortEditor label={t("studio.outputPorts")} ports={selected.data.outputs ?? []} onChange={outputs => updateSelectedData({ outputs })} />
                    </div>
                    {selected.data.outputs?.length ? (
                      <section className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs font-semibold">{t("studio.nodeOutput")}</p>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          {selected.data.outputs.map(port => <span key={port.name} className="rounded border bg-background px-2 py-1">{port.name} · {port.type} {selected.data.outputPreview?.[port.name] !== undefined ? `· ${String(selected.data.outputPreview[port.name])}` : ""}</span>)}
                        </div>
                      </section>
                    ) : null}
                    <label
                      className="block text-sm font-medium"
                      htmlFor="workflow-node-config"
                    >
                      {t("studio.advancedConfig")}
                      <details className="mt-2 rounded-lg border bg-muted/20 p-2">
                        <summary className="cursor-pointer text-xs font-medium">{t("studio.showAdvancedJson")}</summary>
                        <textarea
                          id="workflow-node-config"
                          className="mt-2 min-h-28 w-full rounded-lg border bg-background p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          value={JSON.stringify(selected.data.config, null, 2)}
                          onChange={event => {
                            try {
                              const config = JSON.parse(event.target.value) as Record<string, unknown>;
                              setPropertyError("");
                              updateSelectedData({ config });
                            } catch {
                              setPropertyError(t("studio.invalidConfig"));
                            }
                          }}
                        />
                      </details>
                      {propertyError ? (
                        <span
                          className="mt-1 block text-xs text-destructive"
                          role="alert"
                        >
                          {propertyError}
                        </span>
                      ) : null}
                    </label>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => void improveWithAi()}
                      disabled={generateDraftMutation.isPending || editDraftMutation.isPending}
                    >
                      <WandSparkles className="size-4" />
                      {generateDraftMutation.isPending || editDraftMutation.isPending
                        ? t("studio.checking")
                        : t("studio.improveWithAI")}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("studio.noSelectionDetail")}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="settings" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("studio.serverAuthoritativeSettings")}
                </p>
                <Badge variant="outline">
                  {t("studio.graphPositionPersisted")}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {t("studio.keyboardNudgeHint")}
                </p>
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <label
                  className="text-xs font-medium"
                  htmlFor="workflow-team-notes"
                >
                  {t("studio.teamNotes")}
                </label>
                <textarea
                  id="workflow-team-notes"
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  className="mt-2 min-h-36 w-full rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder={t("studio.notesPlaceholder")}
                />
              </TabsContent>
            </Tabs>
          </aside>
        </section>
        <section
          aria-label="Workflow run and debug drawer"
          className="border-t bg-card"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Terminal className="size-4 text-primary" aria-hidden="true" />
              {t("studio.runDebug")}
              <Badge variant="outline">{t("studio.waitingVerification")}</Badge>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleAlert className="size-4" aria-hidden="true" />
              {t("studio.costPendingVerification")}
            </span>
          </header>
          <Tabs
            value={drawerTab}
            onValueChange={value => setDrawerTab(value as DrawerTab)}
          >
            <TabsList
              className="mx-4 mb-3 grid w-[calc(100%-2rem)] grid-cols-4 gap-1 sm:w-fit sm:grid-cols-7"
              role="tablist"
            >
              {DRAWER_TABS.map(([value, label]) => (
                <TabsTrigger key={value} value={value}>
                  {t(label)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent
              value={drawerTab}
              className="border-t px-4 py-4 text-xs text-muted-foreground"
            >
              {drawerTab === "output"
                ? t("studio.drawerNoOutput")
                : drawerTab === "data"
                  ? t("studio.drawerNoData")
                  : drawerTab === "trace"
                    ? t("studio.drawerNoTrace")
                    : drawerTab === "logs"
                      ? t("studio.drawerNoLogs")
                      : drawerTab === "artifacts"
                        ? t("studio.noArtifacts")
                        : drawerTab === "cost"
                          ? t("studio.costAwaiting")
                          : t("studio.drawerNoErrors")}
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </AppPage>
  );
}

export default function WorkflowStudioPage() {
  const [, setLocation] = useLocation();
  const [isRunRoute] = useRoute("/studio/workflow/run");
  const [surface, setSurface] = useState<StudioSurface>("builder");
  if (isRunRoute)
    return <RunSurface onBack={() => setLocation("/studio/workflow")} />;
  if (surface === "library" || surface === "marketplace")
    return (
      <CatalogSurface
        surface={surface}
        onSurface={setSurface}
        onOpen={(definitionId, versionId, appId) => {
          if (appId) {
            setLocation(`/studio/workflow/run?marketplaceAppId=${appId}`);
            return;
          }
          setLocation(
            `/studio/workflow?definitionId=${definitionId}${versionId ? `&versionId=${versionId}` : ""}`
          );
        }}
      />
    );
  return (
    <BuilderSurface
      surface={surface}
      onSurface={setSurface}
      onRun={definitionId =>
        setLocation(
          `/studio/workflow/run${definitionId ? `?definitionId=${definitionId}` : ""}`
        )
      }
    />
  );
}
