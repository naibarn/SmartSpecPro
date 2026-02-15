/**
 * Security Panel
 *
 * Displays rate limiting metrics and error patterns.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, AlertTriangle, Lock } from "lucide-react";

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
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">Failed to load security stats: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Rate Limit Keys Active</CardTitle>
          <Lock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data?.totalRateLimitKeys ?? 0}</div>
          <p className="text-xs text-muted-foreground">Active rate limit entries in Redis</p>
        </CardContent>
      </Card>

      {/* Rate Limit by Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Rate Limit Keys by Namespace
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Recent Error Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            API Error Types (Last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
