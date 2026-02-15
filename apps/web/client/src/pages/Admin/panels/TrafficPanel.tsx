/**
 * Traffic & Auth Panel
 *
 * Displays daily user activity and login metrics.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserCheck } from "lucide-react";

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
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">Failed to load traffic stats: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totals.totalUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Today</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totals.activeToday ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily Active Users (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
