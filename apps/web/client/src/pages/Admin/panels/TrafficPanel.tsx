/**
 * Traffic & Auth Panel
 *
 * Displays daily user activity and login metrics.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserCheck } from "lucide-react";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

interface TrafficPanelProps {
  refreshInterval: number | null;
}

export default function TrafficPanel({ refreshInterval }: TrafficPanelProps) {
  const { data, isLoading, error } = trpc.adminOps.trafficStats.useQuery(
    { days: 7 },
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
          <p className="text-destructive">Failed to load traffic stats: {error.message}</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashboardKpiCard icon={Users} label="Total Users" value={data?.totals.totalUsers ?? 0} />
        <DashboardKpiCard icon={UserCheck} label="Active Today" value={data?.totals.activeToday ?? 0} />
      </div>

      {/* Daily Activity Table */}
      <DashboardCard title="Daily Active Users (Last 7 Days)">
          {data?.daily && data.daily.length > 0 ? (
            <div className="space-y-2">
              {data.daily.map((day) => (
                <div key={day.date} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="text-sm text-muted-foreground">{day.date}</span>
                  <Badge variant="secondary">{day.userCount} users</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No activity data available.</p>
          )}
      </DashboardCard>
    </div>
  );
}
