/**
 * Docker Compose Management Component
 * 
 * Displays and manages Docker Compose projects and their services
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Layers,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Server,
  FolderOpen,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

type ContainerStatus = "running" | "stopped" | "restarting" | "paused" | "exited" | "dead";

interface ComposeService {
  name: string;
  image: string;
  status: ContainerStatus;
  containerId?: string;
  ports: string[];
}

interface ComposeProject {
  name: string;
  path: string;
  services: ComposeService[];
  status: "running" | "partial" | "stopped";
}

function ServiceStatusBadge({ status }: { status: ContainerStatus }) {
  const config: Record<ContainerStatus, { icon: React.ReactNode; label: string; className: string }> = {
    running: { 
      icon: <CheckCircle2 className="w-3 h-3" />, 
      label: "RUNNING", 
      className: "badge-running" 
    },
    stopped: { 
      icon: <XCircle className="w-3 h-3" />, 
      label: "STOPPED", 
      className: "badge-stopped" 
    },
    exited: { 
      icon: <XCircle className="w-3 h-3" />, 
      label: "EXITED", 
      className: "badge-stopped" 
    },
    paused: { 
      icon: <AlertTriangle className="w-3 h-3" />, 
      label: "PAUSED", 
      className: "badge-warning" 
    },
    restarting: { 
      icon: <RotateCcw className="w-3 h-3 animate-spin" />, 
      label: "RESTARTING", 
      className: "badge-warning" 
    },
    dead: { 
      icon: <XCircle className="w-3 h-3" />, 
      label: "DEAD", 
      className: "badge-stopped" 
    },
  };

  const { icon, label, className } = config[status] || config.stopped;

  return (
    <Badge variant="outline" className={`${className} flex items-center gap-1 font-mono text-[10px] uppercase`}>
      {icon}
      {label}
    </Badge>
  );
}

function ProjectStatusBadge({ status }: { status: "running" | "partial" | "stopped" }) {
  const config = {
    running: { 
      label: "ALL RUNNING", 
      className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
    },
    partial: { 
      label: "PARTIAL", 
      className: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" 
    },
    stopped: { 
      label: "STOPPED", 
      className: "bg-red-500/10 border-red-500/30 text-red-400" 
    },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={`${className} font-mono text-xs uppercase`}>
      {label}
    </Badge>
  );
}

function ProjectCard({ 
  project,
  onAction,
  isLoading,
}: { 
  project: ComposeProject;
  onAction: (action: "start" | "stop" | "restart", projectName: string) => void;
  isLoading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const runningCount = project.services.filter(s => s.status === "running").length;

  return (
    <Card className="bg-card/80 backdrop-blur border-primary/30 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-3">
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <div className="p-2 bg-primary/10 rounded border border-primary/30">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-foreground tracking-wide">{project.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                  <FolderOpen className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{project.path || "N/A"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-mono">
                  {runningCount}/{project.services.length} SERVICES
                </p>
              </div>
              <ProjectStatusBadge status={project.status} />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Services List */}
          <div className="border-t border-primary/20 px-4 py-3 space-y-2">
            {project.services.map((service) => (
              <div 
                key={service.name}
                className="flex items-center justify-between p-3 bg-background/50 rounded border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-sm">{service.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{service.image}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {service.ports.length > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {service.ports[0]}
                    </span>
                  )}
                  <ServiceStatusBadge status={service.status} />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t border-primary/20 p-4 flex gap-2">
            {project.status !== "running" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction("start", project.name)}
                disabled={isLoading}
                className="flex-1 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 text-xs"
              >
                <Play className="w-3 h-3 mr-1" />
                START ALL
              </Button>
            )}
            {project.status !== "stopped" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction("stop", project.name)}
                disabled={isLoading}
                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs"
              >
                <Square className="w-3 h-3 mr-1" />
                STOP ALL
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction("restart", project.name)}
              disabled={isLoading}
              className="flex-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 text-xs"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              RESTART ALL
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function ComposeManagement() {
  const [confirmAction, setConfirmAction] = useState<{
    action: "start" | "stop" | "restart";
    projectName: string;
  } | null>(null);

  // Fetch compose projects
  const { data: composeData, isLoading, refetch } = trpc.compose.list.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Mutations
  const startMutation = trpc.compose.start.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to start project: ${error.message}`);
    },
  });

  const stopMutation = trpc.compose.stop.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to stop project: ${error.message}`);
    },
  });

  const restartMutation = trpc.compose.restart.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to restart project: ${error.message}`);
    },
  });

  const isActionLoading = startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

  const handleAction = (action: "start" | "stop" | "restart", projectName: string) => {
    setConfirmAction({ action, projectName });
  };

  const executeAction = () => {
    if (!confirmAction) return;

    switch (confirmAction.action) {
      case "start":
        startMutation.mutate({ projectName: confirmAction.projectName });
        break;
      case "stop":
        stopMutation.mutate({ projectName: confirmAction.projectName });
        break;
      case "restart":
        restartMutation.mutate({ projectName: confirmAction.projectName });
        break;
    }
    setConfirmAction(null);
  };

  const projects = composeData?.projects || [];
  const runningProjects = projects.filter(p => p.status === "running").length;
  const totalServices = projects.reduce((acc, p) => acc + p.services.length, 0);
  const runningServices = projects.reduce(
    (acc, p) => acc + p.services.filter(s => s.status === "running").length, 
    0
  );

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/80 backdrop-blur border-primary/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded border border-primary/30">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono">COMPOSE PROJECTS</p>
              <p className="text-xl font-bold">{projects.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-card/80 backdrop-blur border-emerald-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono">RUNNING PROJECTS</p>
              <p className="text-xl font-bold text-emerald-400">{runningProjects}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-card/80 backdrop-blur border-primary/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded border border-primary/30">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono">SERVICES</p>
              <p className="text-xl font-bold">
                <span className="text-emerald-400">{runningServices}</span>
                <span className="text-muted-foreground">/{totalServices}</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="border-primary/50 text-primary hover:bg-primary/10"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          REFRESH
        </Button>
      </div>

      {/* Projects List */}
      {isLoading && projects.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground font-mono">Loading compose projects...</span>
        </div>
      ) : composeData?.error ? (
        <Card className="bg-card/80 backdrop-blur border-red-500/30 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-red-400 mb-2" />
          <p className="text-red-400 font-mono text-sm">{composeData.error}</p>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="bg-card/80 backdrop-blur border-primary/30 p-6 text-center">
          <Layers className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground font-mono text-sm">No Docker Compose projects found</p>
          <p className="text-xs text-muted-foreground mt-2">
            Make sure you have docker-compose projects running
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.name}
              project={project}
              onAction={handleAction}
              isLoading={isActionLoading}
            />
          ))}
        </div>
      )}

      {/* Confirm Action Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-primary/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              CONFIRM {confirmAction?.action.toUpperCase()}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-muted-foreground">
              Are you sure you want to {confirmAction?.action} all services in project "{confirmAction?.projectName}"?
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
              {isActionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {confirmAction?.action.toUpperCase()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
