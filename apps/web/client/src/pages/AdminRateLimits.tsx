import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";

interface RateLimitStatus {
  user_id?: string;
  api_key_id?: string;
  limit: number;
  remaining: number;
  reset_time: string;
  window_start: string;
}

interface GlobalStats {
  total_requests: number;
  total_users: number;
  rate_limited_requests: number;
  average_requests_per_user: number;
}

export default function AdminRateLimits() {
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch rate limit status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["rate-limits-status"],
    queryFn: async () => {
      const response = await fetch("/api/v1/rate-limits/status", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch rate limit status");
      return response.json() as Promise<RateLimitStatus[]>;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch global stats
  const { data: globalStats, isLoading: statsLoading } = useQuery({
    queryKey: ["rate-limits-global-stats"],
    queryFn: async () => {
      const response = await fetch("/api/v1/rate-limits/global-stats", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch global stats");
      return response.json() as Promise<GlobalStats>;
    },
    refetchInterval: 30000,
  });

  // Fetch history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["rate-limits-history"],
    queryFn: async () => {
      const response = await fetch("/api/v1/rate-limits/history", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch rate limit history");
      return response.json();
    },
  });

  const filteredStatus = statusData?.filter(
    (item) =>
      item.user_id?.includes(searchTerm) || item.api_key_id?.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rate Limits Management</h1>
          <p className="text-muted-foreground">
            Monitor and manage API rate limits across the platform
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Global Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <DashboardKpiCard
          icon={Activity}
          label="Total Requests"
          value={statsLoading ? "..." : globalStats?.total_requests?.toLocaleString()}
          subLabel="Last 24 hours"
        />
        <DashboardKpiCard
          icon={Users}
          label="Active Users"
          value={statsLoading ? "..." : globalStats?.total_users?.toLocaleString()}
          subLabel="With active requests"
        />
        <DashboardKpiCard
          icon={AlertCircle}
          label="Rate Limited"
          value={statsLoading ? "..." : globalStats?.rate_limited_requests?.toLocaleString()}
          subLabel="Blocked requests"
          valueClassName="text-rose-600"
        />
        <DashboardKpiCard
          icon={TrendingUp}
          label="Avg Requests/User"
          value={statsLoading ? "..." : globalStats?.average_requests_per_user?.toFixed(1)}
          subLabel="Per time window"
        />
      </div>

      {/* Current Status */}
      <DashboardCard
        title="Current Rate Limit Status"
        description="Active rate limits by user and API key"
        trailing={
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by user ID or API key..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        }
      >
        <div className="space-y-4">
          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User/API Key</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Usage %</TableHead>
                  <TableHead>Window Start</TableHead>
                  <TableHead>Reset Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStatus?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No rate limit data available
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStatus?.map((item, idx) => {
                    const usagePercent = ((item.limit - item.remaining) / item.limit) * 100;
                    const isNearLimit = usagePercent > 80;
                    const isAtLimit = item.remaining === 0;

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">
                          {item.user_id || item.api_key_id}
                        </TableCell>
                        <TableCell>{item.limit}</TableCell>
                        <TableCell>{item.remaining}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-secondary rounded-full h-2 max-w-[100px]">
                              <div
                                className={`h-2 rounded-full ${
                                  isAtLimit
                                    ? "bg-destructive"
                                    : isNearLimit
                                    ? "bg-yellow-500"
                                    : "bg-primary"
                                }`}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                            <span className="text-sm">{usagePercent.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.window_start).toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.reset_time).toLocaleTimeString()}
                        </TableCell>
                        <TableCell>
                          {isAtLimit ? (
                            <Badge variant="destructive">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Limited
                            </Badge>
                          ) : isNearLimit ? (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                              <Clock className="mr-1 h-3 w-3" />
                              Near Limit
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-green-500 text-green-500">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              OK
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DashboardCard>

      {/* Recent History */}
      <DashboardCard title="Recent Rate Limit Events" description="History of rate-limited requests">
        <div className="space-y-4">
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : historyData?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No rate limit events recorded
            </div>
          ) : (
            <div className="space-y-2">
              {historyData?.slice(0, 10).map((event: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">
                        Rate limit exceeded for {event.user_id || event.api_key_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.endpoint} - {event.method}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
