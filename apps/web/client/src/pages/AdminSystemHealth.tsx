import { useQuery } from "@tanstack/react-query";
import { formatBytes } from "@smartspec/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface ServiceStatus {
  service: string;
  status: "healthy" | "degraded" | "down";
  message?: string;
  responseTime?: number;
  lastChecked: string;
}

interface SystemMetrics {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  disk_used: number;
  disk_total: number;
  uptime: number;
}

export default function AdminSystemHealth() {
  // Fetch system health
  const { data: healthData, isLoading, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const response = await fetch("/api/v1/system-health/status", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch system health");
      return response.json() as Promise<{
        services: ServiceStatus[];
        overall_status: "healthy" | "degraded" | "down";
      }>;
    },
    refetchInterval: 30000,
  });

  // Fetch system metrics
  const { data: metrics } = useQuery({
    queryKey: ["system-metrics"],
    queryFn: async () => {
      const response = await fetch("/api/v1/system-health/metrics", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return response.json() as Promise<SystemMetrics>;
    },
    refetchInterval: 10000,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "down":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      healthy: "outline" as const,
      degraded: "outline" as const,
      down: "destructive" as const,
    };
    const colors = {
      healthy: "border-green-500 text-green-500",
      degraded: "border-yellow-500 text-yellow-500",
      down: "",
    };
    return (
      <Badge variant={variants[status as keyof typeof variants]} className={colors[status as keyof typeof colors]}>
        {status}
      </Badge>
    );
  };


  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-muted-foreground">
            Monitor system status and performance metrics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Overall Status */}
      <DashboardCard
        eyebrow="Health"
        title="Overall System Status"
        description="Current health across services and infrastructure"
        leading={healthData ? getStatusIcon(healthData.overall_status) : null}
      >
        <div className="text-center py-4">
          {isLoading ? (
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          ) : (
            <>
              <div className="text-4xl font-bold mb-2">
                {healthData?.overall_status.toUpperCase()}
              </div>
              {getStatusBadge(healthData?.overall_status || "unknown")}
            </>
          )}
        </div>
      </DashboardCard>

      {/* Service Status */}
      <DashboardCard title="Service Status" description="Health check for all system services">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {healthData?.services.map((service) => (
            <DashboardCard key={service.service} className="bg-white/80">
              <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {service.service}
                  </h3>
                  {getStatusIcon(service.status)}
                </div>
              </div>
              <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                {getStatusBadge(service.status)}
                {service.responseTime && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Response: {service.responseTime}ms
                  </p>
                )}
                {service.message && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {service.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Last checked: {new Date(service.lastChecked).toLocaleTimeString()}
                </p>
              </div>
            </DashboardCard>
          ))}
        </div>
      </DashboardCard>

      {/* System Metrics */}
      {metrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DashboardKpiCard
              icon={Cpu}
              label="CPU Usage"
              value={`${metrics.cpu_usage.toFixed(1)}%`}
              subLabel={
                <div className="w-full bg-secondary rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${
                      metrics.cpu_usage > 80
                        ? "bg-red-500"
                        : metrics.cpu_usage > 60
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${metrics.cpu_usage}%` }}
                  />
                </div>
              }
            />
            <DashboardKpiCard
              icon={Activity}
              label="Memory"
              value={formatBytes(metrics.memory_used)}
              subLabel={`of ${formatBytes(metrics.memory_total)}`}
            />
            <DashboardKpiCard
              icon={HardDrive}
              label="Disk Space"
              value={formatBytes(metrics.disk_used)}
              subLabel={`of ${formatBytes(metrics.disk_total)}`}
            />
            <DashboardKpiCard
              icon={Server}
              label="Uptime"
              value={formatUptime(metrics.uptime)}
              subLabel="System running"
            />
          </div>
        </>
      )}
    </div>
  );
}
