/**
 * Docker Status Dashboard - Industrial Blueprint Design
 * 
 * Design Philosophy: Technical Blueprint / Engineering Schematic
 * - Blueprint grid background with subtle lines
 * - Technical annotation style with precision emphasis
 * - Diagram-like connections between services
 * - Cyan primary color on deep navy background
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Database, 
  Server, 
  HardDrive, 
  Activity,
  RefreshCw,
  Clock,
  Cpu,
  MemoryStick,
  Network,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Square,
  RotateCcw,
  Terminal,
  Loader2,
  Layers,
  Package,
  Webhook,
  Settings,
  BarChart3,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResourceGraph } from "@/components/ResourceGraph";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageManagement } from "@/components/ImageManagement";
import { ComposeManagement } from "@/components/ComposeManagement";
import { WebhookSettings, EmailSettings } from "@/components/WebhookSettings";

// Container status types
type ContainerStatus = "running" | "stopped" | "restarting" | "paused" | "exited" | "dead";

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  created: string;
  ports: string[];
  uptime: string;
  cpu: string;
  memory: string;
  memoryLimit: string;
}

// Get icon based on image name
function getContainerIcon(image: string) {
  const imageLower = image.toLowerCase();
  if (imageLower.includes("mysql") || imageLower.includes("postgres") || imageLower.includes("mariadb")) {
    return <Database className="w-6 h-6" />;
  }
  if (imageLower.includes("redis") || imageLower.includes("memcached")) {
    return <Server className="w-6 h-6" />;
  }
  if (imageLower.includes("chroma") || imageLower.includes("vector") || imageLower.includes("elastic")) {
    return <HardDrive className="w-6 h-6" />;
  }
  return <Server className="w-6 h-6" />;
}

// Get display name from container name
function getDisplayName(name: string, image: string): string {
  // Extract version from image if available
  const imageParts = image.split(":");
  const version = imageParts[1] || "latest";
  
  // Clean up container name
  const cleanName = name.replace(/^\//, "").replace(/-/g, " ");
  
  // Capitalize first letter of each word
  const displayName = cleanName
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  
  return `${displayName} (${version})`;
}

// Status indicator component
function StatusIndicator({ status }: { status: ContainerStatus }) {
  const config: Record<ContainerStatus, { icon: React.ReactNode; label: string; className: string }> = {
    running: { 
      icon: <CheckCircle2 className="w-4 h-4" />, 
      label: "RUNNING", 
      className: "badge-running" 
    },
    stopped: { 
      icon: <XCircle className="w-4 h-4" />, 
      label: "STOPPED", 
      className: "badge-stopped" 
    },
    exited: { 
      icon: <XCircle className="w-4 h-4" />, 
      label: "EXITED", 
      className: "badge-stopped" 
    },
    paused: { 
      icon: <AlertTriangle className="w-4 h-4" />, 
      label: "PAUSED", 
      className: "badge-warning" 
    },
    restarting: { 
      icon: <RotateCcw className="w-4 h-4 animate-spin" />, 
      label: "RESTARTING", 
      className: "badge-warning" 
    },
    dead: { 
      icon: <XCircle className="w-4 h-4" />, 
      label: "DEAD", 
      className: "badge-stopped" 
    },
  };

  const { icon, label, className } = config[status] || config.stopped;

  return (
    <Badge variant="outline" className={`${className} flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider`}>
      <span className={status === "running" ? "pulse-glow" : ""}>{icon}</span>
      {label}
    </Badge>
  );
}

// Container card component with actions
function ContainerCard({ 
  container, 
  onAction,
  onViewLogs,
  isLoading 
}: { 
  container: ContainerInfo;
  onAction: (action: "start" | "stop" | "restart", containerId: string) => void;
  onViewLogs: (containerId: string, containerName: string) => void;
  isLoading: boolean;
}) {
  const glowClass = container.status === "running" ? "glow-cyan" : 
                    container.status === "paused" || container.status === "restarting" ? "glow-yellow" : "";

  const isRunning = container.status === "running";
  const displayName = getDisplayName(container.name, container.image);

  return (
    <Card className={`relative bg-card/80 backdrop-blur border-primary/30 p-6 transition-all duration-300 hover:border-primary/60 ${glowClass}`}>
      {/* Technical corner markers */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/50" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-primary/50" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-primary/50" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/50" />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded border border-primary/30 text-primary">
            {getContainerIcon(container.image)}
          </div>
          <div>
            <h3 className="font-bold text-foreground tracking-wide text-sm">{displayName}</h3>
            <p className="text-xs text-muted-foreground font-mono">{container.name}</p>
          </div>
        </div>
        <StatusIndicator status={container.status} />
      </div>

      {/* Image info */}
      <p className="text-xs text-muted-foreground mb-4 border-l-2 border-primary/30 pl-3 font-mono">
        {container.image}
      </p>

      {/* Technical specs grid */}
      <div className="grid grid-cols-2 gap-3 text-xs mb-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Network className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono truncate">
            {container.ports.length > 0 ? container.ports[0] : "No ports"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono">{container.uptime}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono">CPU: {container.cpu}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MemoryStick className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono">MEM: {container.memory}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border/50">
        {isRunning ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction("stop", container.id)}
              disabled={isLoading}
              className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs"
            >
              <Square className="w-3 h-3 mr-1" />
              STOP
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction("restart", container.id)}
              disabled={isLoading}
              className="flex-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 text-xs"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              RESTART
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("start", container.id)}
            disabled={isLoading}
            className="flex-1 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 text-xs"
          >
            <Play className="w-3 h-3 mr-1" />
            START
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewLogs(container.id, container.name)}
          className="border-primary/50 text-primary hover:bg-primary/10 text-xs"
        >
          <Terminal className="w-3 h-3 mr-1" />
          LOGS
        </Button>
      </div>
    </Card>
  );
}

// System overview component
function SystemOverview({ 
  containers, 
  dockerInfo 
}: { 
  containers: ContainerInfo[];
  dockerInfo: { version: string; containers: number; running: number; paused: number; stopped: number } | null;
}) {
  const running = containers.filter(c => c.status === "running").length;
  const total = containers.length;
  const allHealthy = running === total && total > 0;

  return (
    <Card className={`bg-card/80 backdrop-blur border-primary/30 p-6 ${allHealthy ? "glow-green" : total === 0 ? "" : "glow-yellow"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded border ${allHealthy ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : total === 0 ? "bg-muted/10 border-muted/30 text-muted-foreground" : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"}`}>
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-wider">SYSTEM STATUS</h2>
            <p className="text-muted-foreground font-mono text-sm">
              {total > 0 ? `${running}/${total} CONTAINERS OPERATIONAL` : "NO CONTAINERS FOUND"}
            </p>
            {dockerInfo && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                Docker {dockerInfo.version}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold ${allHealthy ? "text-emerald-400" : total === 0 ? "text-muted-foreground" : "text-yellow-400"}`}>
            {total > 0 ? Math.round((running / total) * 100) : 0}%
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Health Score
          </div>
        </div>
      </div>
    </Card>
  );
}

// Logs Dialog Component
function LogsDialog({ 
  isOpen, 
  onClose, 
  containerId, 
  containerName 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  containerId: string | null;
  containerName: string;
}) {
  const { data: logsData, isLoading, refetch } = trpc.docker.logs.useQuery(
    { containerId: containerId || "", tail: 200 },
    { enabled: !!containerId }
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-card border-primary/30">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            LOGS: {containerName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-mono">
            Last 200 lines
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-primary/50 text-primary hover:bg-primary/10 text-xs"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            REFRESH
          </Button>
        </div>
        <ScrollArea className="h-[50vh] rounded border border-border/50 bg-background/50">
          <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading logs...
              </div>
            ) : (
              logsData?.logs || "No logs available"
            )}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [selectedContainer, setSelectedContainer] = useState<{ id: string; name: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: "start" | "stop" | "restart"; containerId: string; containerName: string } | null>(null);
  const [activeTab, setActiveTab] = useState("containers");

  // Fetch containers
  const { data: containersData, isLoading: isLoadingContainers, refetch: refetchContainers } = trpc.docker.list.useQuery(
    undefined,
    { refetchInterval: 10000 } // Auto-refresh every 10 seconds
  );

  // Fetch Docker info
  const { data: dockerInfo } = trpc.docker.info.useQuery();

  // Mutations
  const startMutation = trpc.docker.start.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchContainers();
    },
    onError: (error) => {
      toast.error(`Failed to start container: ${error.message}`);
    },
  });

  const stopMutation = trpc.docker.stop.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchContainers();
    },
    onError: (error) => {
      toast.error(`Failed to stop container: ${error.message}`);
    },
  });

  const restartMutation = trpc.docker.restart.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchContainers();
    },
    onError: (error) => {
      toast.error(`Failed to restart container: ${error.message}`);
    },
  });

  const isActionLoading = startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

  const handleAction = (action: "start" | "stop" | "restart", containerId: string) => {
    const container = containersData?.containers.find(c => c.id === containerId);
    setConfirmAction({ 
      action, 
      containerId, 
      containerName: container?.name || containerId 
    });
  };

  const executeAction = () => {
    if (!confirmAction) return;

    switch (confirmAction.action) {
      case "start":
        startMutation.mutate({ containerId: confirmAction.containerId });
        break;
      case "stop":
        stopMutation.mutate({ containerId: confirmAction.containerId });
        break;
      case "restart":
        restartMutation.mutate({ containerId: confirmAction.containerId });
        break;
    }
    setConfirmAction(null);
  };

  const handleViewLogs = (containerId: string, containerName: string) => {
    setSelectedContainer({ id: containerId, name: containerName });
  };

  const containers = containersData?.containers || [];

  // State for selected container stats
  const [selectedStatsContainer, setSelectedStatsContainer] = useState<string | null>(null);

  // Fetch stats history for selected container
  const { data: statsHistoryData } = trpc.docker.statsHistory.useQuery(
    { containerId: selectedStatsContainer || "" },
    { enabled: !!selectedStatsContainer, refetchInterval: 5000 }
  );

  return (
    <div className="min-h-screen blueprint-grid">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Server className="w-6 h-6 text-primary" />
                <h1 className="text-xl font-bold tracking-wider text-foreground">
                  DOCKER STATUS
                </h1>
              </div>
              <Badge variant="outline" className="font-mono text-xs border-primary/50 text-primary">
                SmartSpec Pro
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground font-mono">
                AUTO-REFRESH: 10s
              </span>
              <NotificationCenter />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetchContainers()}
                disabled={isLoadingContainers}
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingContainers ? "animate-spin" : ""}`} />
                REFRESH
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container py-8">
        {/* System overview */}
        <div className="mb-8">
          <SystemOverview containers={containers} dockerInfo={dockerInfo || null} />
        </div>

        {/* Tabs for different sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card/80 border border-primary/30 p-1">
            <TabsTrigger 
              value="containers" 
              className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Server className="w-4 h-4 mr-2" />
              CONTAINERS
            </TabsTrigger>
            <TabsTrigger 
              value="images" 
              className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Package className="w-4 h-4 mr-2" />
              IMAGES
            </TabsTrigger>
            <TabsTrigger 
              value="compose" 
              className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Layers className="w-4 h-4 mr-2" />
              COMPOSE
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Webhook className="w-4 h-4 mr-2" />
              NOTIFICATIONS
            </TabsTrigger>
          </TabsList>

          {/* Containers Tab */}
          <TabsContent value="containers" className="space-y-6">
            {/* Error message */}
            {containersData?.error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded text-red-400 font-mono text-sm">
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                {containersData.error}
              </div>
            )}

            {/* Section header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              <h2 className="text-sm font-bold tracking-[0.3em] text-muted-foreground uppercase">
                Container Registry
              </h2>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            </div>

            {/* Loading state */}
            {isLoadingContainers && containers.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground font-mono">Loading containers...</span>
              </div>
            )}

            {/* Empty state */}
            {!isLoadingContainers && containers.length === 0 && !containersData?.error && (
              <div className="text-center py-12">
                <Server className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-mono">No containers found</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Make sure Docker is running and you have containers created
                </p>
              </div>
            )}

            {/* Container grid */}
            {containers.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {containers.map((container) => (
                  <div key={container.id} className="space-y-2">
                    <ContainerCard 
                      container={container}
                      onAction={handleAction}
                      onViewLogs={handleViewLogs}
                      isLoading={isActionLoading}
                    />
                    {container.status === "running" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedStatsContainer(
                          selectedStatsContainer === container.id ? null : container.id
                        )}
                        className="w-full text-xs font-mono text-muted-foreground hover:text-primary"
                      >
                        <BarChart3 className="w-3 h-3 mr-1" />
                        {selectedStatsContainer === container.id ? "HIDE STATS" : "VIEW STATS"}
                      </Button>
                    )}
                    {selectedStatsContainer === container.id && statsHistoryData && (
                      <ResourceGraph
                        history={statsHistoryData.history}
                        containerName={container.name}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Connection diagram hint */}
            {containers.length > 0 && (
              <div className="mt-12 text-center">
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground border border-border/50 rounded px-4 py-2 bg-card/50">
                  <span className={`w-2 h-2 rounded-full ${containers.every(c => c.status === "running") ? "bg-emerald-400" : "bg-yellow-400"} pulse-glow`} />
                  <span className="font-mono uppercase tracking-wider">
                    {containers.filter(c => c.status === "running").length} of {containers.length} services operational
                  </span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images">
            <ImageManagement />
          </TabsContent>

          {/* Compose Tab */}
          <TabsContent value="compose">
            <ComposeManagement />
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-8">
            <WebhookSettings />
            <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <EmailSettings />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/80 backdrop-blur mt-auto">
        <div className="container py-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>DOCKER ENGINE {dockerInfo?.version || "N/A"}</span>
            <span>SmartSpec Pro Infrastructure Monitor</span>
            <span>© 2025</span>
          </div>
        </div>
      </footer>

      {/* Logs Dialog */}
      <LogsDialog
        isOpen={!!selectedContainer}
        onClose={() => setSelectedContainer(null)}
        containerId={selectedContainer?.id || null}
        containerName={selectedContainer?.name || ""}
      />

      {/* Confirm Action Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-primary/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              CONFIRM {confirmAction?.action.toUpperCase()}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-muted-foreground">
              Are you sure you want to {confirmAction?.action} container "{confirmAction?.containerName}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeAction}
              className={`font-mono ${
                confirmAction?.action === "stop" 
                  ? "bg-red-500 hover:bg-red-600" 
                  : confirmAction?.action === "restart"
                  ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {confirmAction?.action.toUpperCase()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
