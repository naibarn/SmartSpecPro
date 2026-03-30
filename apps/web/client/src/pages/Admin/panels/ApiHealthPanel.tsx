/**
 * API Health Panel
 *
 * Displays provider usage metrics, latency, and error rates.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

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
      <DashboardCard>
        <div>
          <p className="text-destructive">Failed to load API health: {error.message}</p>
        </div>
      </DashboardCard>
    );
  }

  const summary = data?.summary;
  const errorRateHigh = (summary?.errorRate ?? 0) > 5;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <DashboardKpiCard icon={Activity} label="Total Requests" value={summary?.totalRequests ?? 0} subLabel="Last 24 hours" />
        <DashboardKpiCard
          icon={AlertTriangle}
          label="Error Rate"
          value={<span className={cn(errorRateHigh && "text-destructive")}>{summary?.errorRate ?? 0}%</span>}
          iconClassName={errorRateHigh ? "text-destructive" : "text-muted-foreground"}
        />
        <DashboardKpiCard icon={Clock} label="Avg Latency" value={`${summary?.avgLatencyMs ?? 0}ms`} />
        <DashboardKpiCard icon={Clock} label="P95 Latency" value={`${summary?.p95LatencyMs ?? 0}ms`} />
      </div>

      {/* Per-Model Breakdown */}
      <DashboardCard title="Model Usage (Last 24h)">
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
      </DashboardCard>
    </div>
  );
}
