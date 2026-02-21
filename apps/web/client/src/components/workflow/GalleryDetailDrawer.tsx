import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2,
  Clock,
  Layers,
  Download,
  ArrowRight,
  Zap,
  Brain,
  Database,
  GitBranch,
  Globe,
  Mail,
  Settings,
  Image,
  ChevronRight,
  Tag,
  Building2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_COLOR_MAP,
  DEFAULT_CATEGORY_COLOR,
  NODE_TYPE_CATEGORY_COLORS,
  DEFAULT_NODE_COLOR,
} from "./galleryConstants";

interface GalleryDetailDrawerProps {
  open: boolean;
  templateId: number | null;
  onClose: () => void;
}

/** Map nodeType prefix to a category with icon and label */
const NODE_CATEGORIES: Record<
  string,
  { icon: typeof Zap; label: string; color: string }
> = {
  // Triggers
  manual_trigger: { icon: Zap, label: "Trigger", color: "#10B981" },
  schedule_trigger: { icon: Clock, label: "Schedule", color: "#10B981" },
  webhook_trigger: { icon: Globe, label: "Webhook", color: "#10B981" },
  event_trigger: { icon: Zap, label: "Event", color: "#10B981" },
  form_input: { icon: Settings, label: "Form", color: "#10B981" },
  file_upload_trigger: { icon: Zap, label: "Upload", color: "#10B981" },
  queue_trigger: { icon: Zap, label: "Queue", color: "#10B981" },
  error_trigger: { icon: Zap, label: "Error", color: "#10B981" },
  // AI
  llm_call: { icon: Brain, label: "AI / LLM", color: "#3B82F6" },
  rag_query: { icon: Brain, label: "RAG", color: "#3B82F6" },
  embedding_generator: { icon: Brain, label: "Embedding", color: "#3B82F6" },
  multi_model_router: { icon: Brain, label: "Router", color: "#3B82F6" },
  prompt_template: { icon: Brain, label: "Prompt", color: "#3B82F6" },
  output_parser: { icon: Brain, label: "Parser", color: "#3B82F6" },
  // Flow
  conditional: { icon: GitBranch, label: "Condition", color: "#8B5CF6" },
  loop: { icon: GitBranch, label: "Loop", color: "#8B5CF6" },
  parallel: { icon: GitBranch, label: "Parallel", color: "#8B5CF6" },
  join: { icon: GitBranch, label: "Join", color: "#8B5CF6" },
  switch: { icon: GitBranch, label: "Switch", color: "#8B5CF6" },
  retry: { icon: GitBranch, label: "Retry", color: "#8B5CF6" },
  delay: { icon: Clock, label: "Delay", color: "#8B5CF6" },
  // Data
  database_query: { icon: Database, label: "Database", color: "#F97316" },
  transformer: { icon: Settings, label: "Transform", color: "#F97316" },
  filter: { icon: Settings, label: "Filter", color: "#F97316" },
  template_engine: { icon: Settings, label: "Template", color: "#F97316" },
  code_runner: { icon: Settings, label: "Code", color: "#F97316" },
  csv_parser: { icon: Settings, label: "CSV", color: "#F97316" },
  validator: { icon: Settings, label: "Validate", color: "#F97316" },
  set_variable: { icon: Settings, label: "Variable", color: "#F97316" },
  merge_data: { icon: Settings, label: "Merge", color: "#F97316" },
  map_array: { icon: Settings, label: "Map", color: "#F97316" },
  read_file: { icon: Database, label: "Read File", color: "#F97316" },
  write_file: { icon: Database, label: "Write File", color: "#F97316" },
  // Integration
  http_request: { icon: Globe, label: "HTTP", color: "#06B6D4" },
  graphql_request: { icon: Globe, label: "GraphQL", color: "#06B6D4" },
  websocket_client: { icon: Globe, label: "WebSocket", color: "#06B6D4" },
  storage_action: { icon: Database, label: "Storage", color: "#06B6D4" },
  // Output
  send_email: { icon: Mail, label: "Email", color: "#EF4444" },
  send_notification: { icon: Mail, label: "Notify", color: "#EF4444" },
  workflow_response: { icon: Mail, label: "Response", color: "#EF4444" },
  // Media
  generate_image: { icon: Image, label: "Image Gen", color: "#F59E0B" },
  skill: { icon: Settings, label: "Skill", color: "#F59E0B" },
  approval_gate: { icon: Settings, label: "Approval", color: "#F59E0B" },
};

function svgToDataUrl(svgString: string): string {
  const base64 = btoa(unescape(encodeURIComponent(svgString)));
  return `data:image/svg+xml;base64,${base64}`;
}

/** Build ordered step list from workflowJson using topological sort */
function buildStepList(
  workflowJson: { nodes?: any[]; edges?: any[] } | null
): Array<{ id: string; nodeType: string; label: string; config?: any }> {
  if (!workflowJson?.nodes?.length) return [];

  const nodes = workflowJson.nodes;
  const edges = workflowJson.edges || [];

  // Build adjacency for topological sort
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // BFS topological sort
  const queue = nodes
    .filter((n: any) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n: any) => n.id);
  const ordered: string[] = [];
  while (queue.length) {
    const curr = queue.shift()!;
    ordered.push(curr);
    for (const next of adj.get(curr) || []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  // Add any remaining (cycles or disconnected)
  for (const n of nodes) {
    if (!ordered.includes(n.id)) ordered.push(n.id);
  }

  const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
  return ordered.map((id) => {
    const n = nodeMap.get(id);
    return {
      id,
      nodeType: n?.data?.nodeType || "unknown",
      label: n?.data?.label || n?.data?.nodeType || "Step",
      config: n?.data?.config,
    };
  });
}

/** Extract a short human-readable hint from config */
function getConfigHint(nodeType: string, config?: any): string | null {
  if (!config) return null;
  if (config.schedule) return `Cron: ${config.schedule}`;
  if (config.model) return `Model: ${config.model}`;
  if (config.prompt) {
    const p = String(config.prompt);
    return p.length > 80 ? p.slice(0, 77) + "..." : p;
  }
  if (config.query) {
    const q = String(config.query);
    return q.length > 60 ? q.slice(0, 57) + "..." : q;
  }
  if (config.to) {
    const to = Array.isArray(config.to) ? config.to.join(", ") : config.to;
    return `To: ${to}`;
  }
  if (config.url) return `URL: ${config.url}`;
  if (config.expression) {
    const e = String(config.expression);
    return e.length > 60 ? e.slice(0, 57) + "..." : e;
  }
  return null;
}

export function GalleryDetailDrawer({
  open,
  templateId,
  onClose,
}: GalleryDetailDrawerProps) {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(5, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const { data: template, isLoading } = trpc.workflow.getTemplate.useQuery(
    { id: templateId! },
    { enabled: open && templateId !== null }
  );

  const useTemplateMutation = trpc.workflow.useTemplate.useMutation();

  async function handleUseTemplate() {
    if (!template) return;
    if (!isAuthenticated) {
      onClose();
      setLocation(`/login?redirect=${encodeURIComponent("/workflows/gallery")}`);
      return;
    }
    try {
      const result = await useTemplateMutation.mutateAsync({
        templateId: template.id,
      });
      onClose();
      toast.success("Template loaded — configure your connections and run.");
      setLocation(`/workflows/editor/${result.id}`);
    } catch {
      toast.error("Could not load template. Please try again.");
    }
  }

  const steps = template ? buildStepList(template.workflowJson) : [];

  // Get category color
  const catColors = template?.categoryId
    ? DEFAULT_CATEGORY_COLOR
    : DEFAULT_CATEGORY_COLOR;

  return (
    <>
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[640px] sm:max-w-[640px] overflow-y-auto p-0"
      >
        {isLoading ? (
          <div className="space-y-4 p-6">
            <div className="h-7 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-52 w-full rounded-xl bg-muted animate-pulse" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : template ? (
          <div className="flex flex-col h-full">
            {/* Header with gradient */}
            <div className="bg-gradient-to-br from-blue-50 via-purple-50/50 to-pink-50/30 border-b px-6 pt-6 pb-5">
              <SheetHeader className="space-y-1">
                <SheetTitle className="text-xl leading-tight pr-8">
                  {template.name}
                </SheetTitle>
              </SheetHeader>

              {/* Stats row */}
              <div className="flex items-center gap-4 mt-3">
                {template.stepCount != null && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Layers className="h-4 w-4" />
                    <span>{template.stepCount} steps</span>
                  </div>
                )}
                {template.estimatedSetupMinutes != null && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>~{template.estimatedSetupMinutes} min setup</span>
                  </div>
                )}
                {template.downloadCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Download className="h-4 w-4" />
                    <span>{template.downloadCount} uses</span>
                  </div>
                )}
              </div>

              {/* Tags row */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {template.industry &&
                  (template.industry as string[]).map((ind: string) => (
                    <span
                      key={ind}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/80 text-gray-700 border"
                    >
                      <Building2 className="h-3 w-3" />
                      {ind}
                    </span>
                  ))}
                {template.tags &&
                  (template.tags as string[]).slice(0, 5).map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/60 text-gray-500"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Description */}
              {template.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {template.description}
                </p>
              )}

              {/* SVG Preview with expand button */}
              {template.previewSvg && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Workflow Diagram
                  </h4>
                  <div
                    className="relative rounded-xl border bg-white p-3 shadow-sm group cursor-pointer"
                    onClick={() => { resetView(); setDiagramOpen(true); }}
                  >
                    <img
                      src={svgToDataUrl(template.previewSvg)}
                      alt="Workflow topology diagram"
                      className="w-full rounded-lg"
                    />
                    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm flex items-center gap-1.5">
                        <Maximize2 className="h-4 w-4" />
                        Click to expand
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Visual step-by-step pipeline */}
              {steps.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Workflow Steps
                  </h4>
                  <div className="relative">
                    {steps.map((step, idx) => {
                      const cat = NODE_CATEGORIES[step.nodeType];
                      const Icon = cat?.icon || Settings;
                      const color =
                        NODE_TYPE_CATEGORY_COLORS[step.nodeType] ||
                        DEFAULT_NODE_COLOR;
                      const hint = getConfigHint(step.nodeType, step.config);
                      const isLast = idx === steps.length - 1;

                      return (
                        <div key={step.id} className="relative flex gap-3">
                          {/* Vertical line connector */}
                          {!isLast && (
                            <div
                              className="absolute left-[19px] top-10 bottom-0 w-0.5"
                              style={{ backgroundColor: `${color}30` }}
                            />
                          )}

                          {/* Icon circle */}
                          <div
                            className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full shrink-0 shadow-sm"
                            style={{
                              backgroundColor: `${color}18`,
                              border: `2px solid ${color}`,
                            }}
                          >
                            <Icon
                              className="h-4 w-4"
                              style={{ color }}
                            />
                          </div>

                          {/* Content */}
                          <div className={`flex-1 pb-4 ${isLast ? "" : "mb-1"}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Step {idx + 1}
                              </span>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider text-white"
                                style={{ backgroundColor: color }}
                              >
                                {cat?.label || step.nodeType}
                              </span>
                            </div>
                            <p className="text-sm font-medium mt-0.5">
                              {step.label}
                            </p>
                            {hint && (
                              <p className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-1 font-mono leading-relaxed break-all">
                                {hint}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer */}
            <div className="border-t bg-white px-6 py-4 shrink-0">
              <Button
                className="w-full h-11 text-base gap-2"
                onClick={handleUseTemplate}
                disabled={useTemplateMutation.isPending}
              >
                {useTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Use This Template
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>

    {/* Fullscreen Diagram Viewer */}
    {template?.previewSvg && (
      <Dialog open={diagramOpen} onOpenChange={setDiagramOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[90vh] p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white/90 backdrop-blur rounded-lg shadow-lg border px-2 py-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium w-12 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.25))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={resetView}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Canvas */}
          <div
            className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] bg-[length:20px_20px]"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isPanning.current ? "none" : "transform 0.15s ease-out",
              }}
            >
              <img
                src={svgToDataUrl(template.previewSvg)}
                alt="Workflow topology diagram"
                className="max-w-none select-none pointer-events-none"
                draggable={false}
                style={{ width: "800px" }}
              />
            </div>
          </div>

          {/* Template name badge */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur rounded-lg shadow-lg border px-4 py-2">
            <span className="text-sm font-medium">{template.name}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {template.stepCount} steps
            </span>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
