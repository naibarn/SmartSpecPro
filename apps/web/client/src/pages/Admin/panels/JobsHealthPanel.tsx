/**
 * Jobs Health Panel
 *
 * Displays Cloud Tasks event metrics and recent failures.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

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
      <DashboardCard>
        <div>
          <p className="text-destructive">Failed to load jobs health: {error.message}</p>
        </div>
      </DashboardCard>
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
          <DashboardKpiCard
            key={status}
            icon={CheckCircle}
            label={status.replace('_', ' ')}
            value={count}
            iconClassName={cn("text-muted-foreground")}
            badge={<div className={cn("h-2 w-2 rounded-full mt-1", STATUS_COLORS[status] || "bg-gray-400")} />}
          />
        ))}
      </div>

      {/* Total Summary */}
      <DashboardCard title="Overview">
        <div className="flex items-center justify-between">
          {hasFailures && (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {failedCount} failed
            </Badge>
          )}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            Total task events: {totalJobs}
          </div>
        </div>
      </DashboardCard>

      {/* Recent Failures */}
      {data?.recentFailures && data.recentFailures.length > 0 && (
        <DashboardCard
          title="Recent Failures"
          leading={<XCircle className="h-4 w-4 text-destructive" />}
        >
          <div>
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
          </div>
        </DashboardCard>
      )}
    </div>
  );
}
