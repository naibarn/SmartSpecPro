/**
 * Security Panel
 *
 * Displays rate limiting metrics and error patterns.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, AlertTriangle, Lock } from "lucide-react";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

interface SecurityPanelProps {
  refreshInterval: number | null;
}

export default function SecurityPanel({ refreshInterval }: SecurityPanelProps) {
  const { data, isLoading, error } = trpc.adminOps.securityStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

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
        <div className="py-6">
          <p className="text-destructive">Failed to load security stats: {error.message}</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <DashboardKpiCard icon={Lock} label="Rate Limit Keys Active" value={data?.totalRateLimitKeys ?? 0} subLabel={<span className="text-xs text-muted-foreground">Active rate limit entries in Redis</span>} />

      {/* Rate Limit by Endpoint */}
      <DashboardCard title="Rate Limit Keys by Namespace">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Rate Limit Keys by Namespace
          </h3>
          {data?.rateLimitKeys && data.rateLimitKeys.length > 0 ? (
            <div className="space-y-2">
              {data.rateLimitKeys.map((item) => (
                <div key={item.endpoint} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="font-mono text-xs">{item.endpoint}</span>
                  <Badge variant="secondary">{item.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rate limit data available.</p>
          )}
        </div>
      </DashboardCard>

      {/* Recent Error Types */}
      <DashboardCard title="API Error Types (Last 24h)">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            API Error Types (Last 24h)
          </h3>
          {data?.recentErrors && data.recentErrors.length > 0 ? (
            <div className="space-y-2">
              {data.recentErrors.map((err) => (
                <div key={err.errorType} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="font-mono text-xs">{err.errorType}</span>
                  <Badge variant="destructive">{err.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No API errors in the last 24 hours.</p>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
