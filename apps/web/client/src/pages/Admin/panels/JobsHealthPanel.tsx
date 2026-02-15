/**
 * Jobs Health Panel
 *
 * Displays Cloud Tasks event metrics and recent failures.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobsHealthPanelProps {
  refreshInterval: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500",
  processing: "bg-blue-500",
  queued: "bg-yellow-500",
  failed: "bg-red-500",
  dead_letter: "bg-red-700",
};

export default function JobsHealthPanel({ refreshInterval }: JobsHealthPanelProps) {
  const { data, isLoading, error } = trpc.adminOps.jobsHealth.useQuery(undefined, {
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
          <p className="text-destructive">Failed to load jobs health: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const counts = data?.countsByStatus ?? {};
  const totalJobs = Object.values(counts).reduce((sum, c) => sum + c, 0);
  const failedCount = (counts.failed ?? 0) + (counts.dead_letter ?? 0);
  const hasFailures = failedCount > 0;

  return (
    <div className="space-y-4">
      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(counts).map(([status, count]) => (
          <Card key={status}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium capitalize">{status.replace('_', ' ')}</CardTitle>
              <div className={cn("h-2 w-2 rounded-full", STATUS_COLORS[status] || "bg-gray-400")} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Overview</CardTitle>
          {hasFailures && (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {failedCount} failed
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Total task events: {totalJobs}
          </div>
        </CardContent>
      </Card>

      {/* Recent Failures */}
      {data?.recentFailures && data.recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Recent Failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recentFailures.slice(0, 10).map((failure) => (
                <div key={failure.id} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs truncate max-w-[200px]">{failure.taskId}</span>
                    <Badge variant="outline">{failure.queue}</Badge>
                  </div>
                  {failure.error && (
                    <p className="text-xs text-destructive truncate">{failure.error}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Attempts: {failure.attempts}</span>
                    {failure.createdAt && <span>{new Date(failure.createdAt).toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
