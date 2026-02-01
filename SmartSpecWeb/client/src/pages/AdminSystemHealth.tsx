import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Overall System Status
            {healthData && getStatusIcon(healthData.overall_status)}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Service Status */}
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>Health check for all system services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {healthData?.services.map((service) => (
              <Card key={service.service}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {service.service}
                    </CardTitle>
                    {getStatusIcon(service.status)}
                  </div>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Metrics */}
      {metrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.cpu_usage.toFixed(1)}%</div>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memory</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatBytes(metrics.memory_used)}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {formatBytes(metrics.memory_total)}
                </p>
                <div className="w-full bg-secondary rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{
                      width: `${(metrics.memory_used / metrics.memory_total) * 100}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Disk Space</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatBytes(metrics.disk_used)}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {formatBytes(metrics.disk_total)}
                </p>
                <div className="w-full bg-secondary rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{
                      width: `${(metrics.disk_used / metrics.disk_total) * 100}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatUptime(metrics.uptime)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">System running</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
