/**
 * Kie AI Health Panel
 *
 * Displays media callback event metrics and DLQ status.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, Webhook, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

interface KieAiHealthPanelProps {
  refreshInterval: number | null;
}

export default function KieAiHealthPanel({ refreshInterval }: KieAiHealthPanelProps) {
  const { data, isLoading, error } = trpc.adminOps.kieAiHealth.useQuery(
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
          <p className="text-destructive">Failed to load Kie AI health: {error.message}</p>
        </div>
      </DashboardCard>
    );
  }

  const summary = data?.summary;
  const callbackRateLow = (summary?.callbackRate ?? 100) < 50;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <DashboardKpiCard icon={Webhook} label="Total Events" value={summary?.total ?? 0} subLabel="Last 24 hours" />
        <DashboardKpiCard icon={CheckCircle} label="Completed" value={summary?.completed ?? 0} />
        <DashboardKpiCard
          icon={AlertTriangle}
          label="Failed"
          value={<span className={cn((summary?.failed ?? 0) > 0 && "text-destructive")}>{summary?.failed ?? 0}</span>}
          iconClassName={cn((summary?.failed ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}
        />
        <DashboardKpiCard
          icon={Clock}
          label="Callback Rate"
          value={<span className={cn(callbackRateLow && "text-destructive")}>{summary?.callbackRate ?? 0}%</span>}
          subLabel={callbackRateLow ? <p className="text-xs text-destructive">Below threshold</p> : undefined}
        />
      </div>

      {/* Processing Status */}
      <DashboardCard title="Processing Status">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              Pending: {summary?.pending ?? 0}
            </Badge>
            <Badge variant="secondary">
              Processing: {summary?.processing ?? 0}
            </Badge>
            <Badge variant={data?.dlqCount ? "destructive" : "secondary"}>
              Dead Letter Queue: {data?.dlqCount ?? 0}
            </Badge>
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}
