/**
 * McpServersSettingsPanel — user-facing MCP server list in Settings > Integrations.
 *
 * Shows tenant's MCP servers with health status, transport type, and tool count.
 * Users can test connections. Server creation/deletion is admin-only.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plug, RefreshCw, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardCard } from "@/components/dashboard";

const HEALTH_COLORS: Record<string, string> = {
  healthy: "bg-green-100 text-green-700",
  unhealthy: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

export function McpServersSettingsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [testingId, setTestingId] = useState<number | null>(null);

  const serversQuery = trpc.mcpServers.list.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const testMutation = trpc.mcpServers.testConnection.useMutation();

  const servers = serversQuery.data ?? [];

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const result = await testMutation.mutateAsync({ id });
      if (result.reachable) {
        toast.success(`Connected! ${result.toolCount} tools (${result.latencyMs}ms)`);
      } else {
        toast.error("Server unreachable");
      }
      serversQuery.refetch();
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <DashboardCard
      title="MCP Servers"
      description="External tool servers connected to your organization via Model Context Protocol"
      leading={<Plug className="h-5 w-5 text-sky-500" />}
      trailing={
        isAdmin ? (
          <Link href="/admin/mcp-servers">
            <Button variant="outline" size="sm" className="gap-1">
              <ExternalLink className="h-3.5 w-3.5" />
              Manage
            </Button>
          </Link>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {serversQuery.isLoading ? "Checking registry..." : `${servers.length} server${servers.length === 1 ? "" : "s"} available`}
          </div>
        </div>

        {serversQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : serversQuery.isError ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            MCP Server Registry is not enabled for your organization.
          </p>
        ) : servers.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            <Plug className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No MCP servers configured.</p>
            {isAdmin && (
              <p className="text-xs mt-1">
                Go to <Link href="/admin/mcp-servers" className="text-blue-500 underline">Admin &gt; MCP Servers</Link> to add one.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2",
                  !server.enabled && "opacity-50",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Plug className="h-4 w-4 text-orange-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{server.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{server.transportType}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {(server.description as string) || server.slug}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-[10px]", HEALTH_COLORS[server.healthStatus ?? "unknown"])}>
                    {server.healthStatus === "healthy" ? (
                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                    ) : (
                      <XCircle className="h-3 w-3 mr-0.5" />
                    )}
                    {server.healthStatus ?? "unknown"}
                  </Badge>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleTest(server.id)}
                      disabled={testingId === server.id}
                      title="Test connection"
                    >
                      {testingId === server.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
