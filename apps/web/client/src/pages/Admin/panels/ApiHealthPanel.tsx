/**
 * API Health Panel
 *
 * Displays provider usage metrics, latency, and error rates.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Clock, AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiHealthPanelProps {
  refreshInterval: number | null;
}

export default function ApiHealthPanel({ refreshInterval }: ApiHealthPanelProps) {
  const { data, isLoading, error } = trpc.adminOps.apiHealth.useQuery(
    { hours: 24 },
    { refetchInterval: refreshInterval ?? false }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">Failed to load API health: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const errorRateHigh = (summary?.errorRate ?? 0) > 5;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalRequests ?? 0}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className={cn("h-4 w-4", errorRateHigh ? "text-destructive" : "text-muted-foreground")} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", errorRateHigh && "text-destructive")}>
              {summary?.errorRate ?? 0}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.avgLatencyMs ?? 0}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">P95 Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.p95LatencyMs ?? 0}ms</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Model Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Model Usage (Last 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.byProvider && data.byProvider.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Model</th>
                    <th className="text-right py-2 font-medium">Requests</th>
                    <th className="text-right py-2 font-medium">Errors</th>
                    <th className="text-right py-2 font-medium">Avg Latency</th>
                    <th className="text-right py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byProvider.map((p) => (
                    <tr key={p.model} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{p.model}</td>
                      <td className="text-right py-2">{p.requests}</td>
                      <td className="text-right py-2">
                        <Badge variant={p.errors > 0 ? "destructive" : "secondary"}>
                          {p.errors}
                        </Badge>
                      </td>
                      <td className="text-right py-2">{p.avgLatencyMs}ms</td>
                      <td className="text-right py-2">${p.totalCostUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No API usage data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
