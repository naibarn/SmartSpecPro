import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2,
  Users,
  Coins,
  ArrowRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Bot,
  Shield,
  GitBranch,
  Layers,
  BookOpen,
  Sparkles,
  UserCheck,
  MonitorPlay,
  GitFork,
  RefreshCw,
  Search,
  Braces,
  ShieldAlert,
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

interface AgencyMarketplaceDrawerProps {
  open: boolean;
  agencyId: string | null;
  onClose: () => void;
}

const NODE_TYPE_META: Record<string, { icon: typeof Bot; label: string; color: string }> = {
  agent: { icon: Bot, label: "Agent", color: "#3B82F6" },
  supervisor: { icon: Shield, label: "Supervisor", color: "#8B5CF6" },
  router: { icon: GitBranch, label: "Router", color: "#F97316" },
  aggregator: { icon: Layers, label: "Aggregator", color: "#06B6D4" },
  knowledge_base: { icon: BookOpen, label: "Knowledge", color: "#10B981" },
  skill_call: { icon: Sparkles, label: "Skill", color: "#F59E0B" },
  human_approval: { icon: UserCheck, label: "Approval", color: "#EF4444" },
  browser_session: { icon: MonitorPlay, label: "Browser Session", color: "#0891B2" },
  conditional_branch: { icon: GitFork, label: "Branch", color: "#D97706" },
  parallel_fan_out: { icon: Layers, label: "Parallel", color: "#7C3AED" },
  loop_retry: { icon: RefreshCw, label: "Loop", color: "#059669" },
  skill_discovery: { icon: Search, label: "Discovery", color: "#EC4899" },
  data_transform: { icon: Braces, label: "Transform", color: "#64748B" },
  error_handler: { icon: ShieldAlert, label: "Error Handler", color: "#DC2626" },
};

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function AgencyMarketplaceDrawer({
  open,
  agencyId,
  onClose,
}: AgencyMarketplaceDrawerProps) {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [diagramOpen, setDiagramOpen] = useState(false);

  // Pan & zoom state
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });

  const resetView = useCallback(() => {
    setViewScale(1);
    setViewOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setViewScale((s) => Math.max(0.25, Math.min(4, s - e.deltaY * 0.001)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    panRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: viewOffset.x, origY: viewOffset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [viewOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!panRef.current.dragging) return;
    setViewOffset({
      x: panRef.current.origX + (e.clientX - panRef.current.startX),
      y: panRef.current.origY + (e.clientY - panRef.current.startY),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    panRef.current.dragging = false;
  }, []);

  const agencyQuery = trpc.agency.getMarketplaceAgency.useQuery(
    { id: agencyId! },
    { enabled: open && agencyId !== null },
  );

  const useMutation = trpc.agency.useMarketplaceAgency.useMutation({
    onSuccess: (data) => {
      toast.success("Agency cloned successfully!");
      onClose();
      setLocation(`/agencies/${data.agencyId}/edit`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleUse = () => {
    if (!isAuthenticated) {
      setLocation(`/login?redirect=${encodeURIComponent("/agencies/marketplace")}`);
      return;
    }
    if (agencyId) {
      useMutation.mutate({ agencyId });
    }
  };

  const agency = agencyQuery.data;

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
        <SheetContent side="right" className="w-full sm:w-[540px] md:w-[600px] p-0 flex flex-col max-h-screen">
          <SheetHeader className="sr-only">
            <SheetTitle>{agency?.name ?? "Agency Details"}</SheetTitle>
          </SheetHeader>

          {/* Loading */}
          {agencyQuery.isLoading && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {agencyQuery.isError && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-lg font-medium mb-2">Could not load agency</p>
                <p className="text-muted-foreground mb-4">{agencyQuery.error.message}</p>
                <Button variant="outline" onClick={() => agencyQuery.refetch()}>Try Again</Button>
              </div>
            </div>
          )}

          {/* Content */}
          {agency && (
            <>
              {/* Header */}
              <div className="relative px-6 pt-8 pb-5 bg-gradient-to-br from-purple-600/10 via-indigo-500/5 to-transparent border-b">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>

                <h2 className="text-xl font-bold pr-8">{agency.name}</h2>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {agency.agents.length} Agent{agency.agents.length !== 1 ? "s" : ""}
                  </span>
                  {agency.creatorFeeCredits > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Coins className="h-4 w-4" />
                      {agency.creatorFeeCredits} credits
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-green-600 font-medium">
                      Free
                    </span>
                  )}
                </div>

                {agency.ownerName && (
                  <p className="text-xs text-muted-foreground mt-2">
                    By {agency.ownerName}
                  </p>
                )}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Description */}
                {agency.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {agency.description}
                  </p>
                )}

                {/* SVG Preview */}
                {agency.previewSvg && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Agent Topology
                    </h4>
                    <div
                      className="relative rounded-xl border bg-white p-3 shadow-sm group cursor-pointer"
                      onClick={() => { resetView(); setDiagramOpen(true); }}
                    >
                      <img
                        src={svgToDataUrl(agency.previewSvg)}
                        alt="Agency topology diagram"
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

                {/* Agent list */}
                {agency.agents.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Agents
                    </h4>
                    <div className="space-y-2">
                      {agency.agents.map((agent: { id: string; nodeType: string; name: string; isEntryPoint?: boolean }) => {
                        const meta = NODE_TYPE_META[agent.nodeType] ?? NODE_TYPE_META.agent;
                        const Icon = meta.icon;
                        return (
                          <div key={agent.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-white/50">
                            <div
                              className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                              style={{ backgroundColor: `${meta.color}18`, border: `2px solid ${meta.color}` }}
                            >
                              <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{agent.name}</p>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider text-white mt-0.5"
                                style={{ backgroundColor: meta.color }}
                              >
                                {meta.label}
                              </span>
                            </div>
                            {agent.isEntryPoint && (
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                Entry
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t px-6 py-4 bg-background/95 backdrop-blur">
                <Button
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-700 hover:to-indigo-600 text-white"
                  onClick={handleUse}
                  disabled={useMutation.isPending}
                >
                  {useMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Use This Agency
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Fullscreen diagram dialog */}
      {agency?.previewSvg && (
        <Dialog open={diagramOpen} onOpenChange={setDiagramOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-[1200px] h-[800px] p-0 overflow-hidden">
            {/* Toolbar */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-lg shadow-sm border px-2 py-1">
              <button onClick={() => setViewScale((s) => Math.min(4, s + 0.25))} className="p-1 hover:bg-muted rounded"><ZoomIn className="h-4 w-4" /></button>
              <button onClick={() => setViewScale((s) => Math.max(0.25, s - 0.25))} className="p-1 hover:bg-muted rounded"><ZoomOut className="h-4 w-4" /></button>
              <button onClick={resetView} className="p-1 hover:bg-muted rounded"><RotateCcw className="h-4 w-4" /></button>
              <span className="text-[11px] tabular-nums text-muted-foreground min-w-[3ch] text-center">{Math.round(viewScale * 100)}%</span>
            </div>

            {/* Canvas */}
            <div
              className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
              style={{ background: `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='%23e5e7eb' stroke-width='0.5'/%3E%3C/svg%3E")` }}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${viewScale})`, transformOrigin: "center center", transition: panRef.current.dragging ? "none" : "transform 0.15s ease-out" }}
              >
                <img
                  src={svgToDataUrl(agency.previewSvg)}
                  alt="Agency topology diagram — fullscreen"
                  className="max-w-none"
                  draggable={false}
                />
              </div>
            </div>

            {/* Agency name badge */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur rounded-lg shadow-sm border px-4 py-1.5 text-sm font-medium">
              {agency.name}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
