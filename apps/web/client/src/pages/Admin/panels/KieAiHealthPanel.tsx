/**
 * Kie AI Health Panel
 *
 * Displays media callback event metrics and DLQ status.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Webhook, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">Failed to load Kie AI health: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const callbackRateLow = (summary?.callbackRate ?? 100) < 50;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.completed ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertTriangle className={cn(
              "h-4 w-4",
              (summary?.failed ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"
            )} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", (summary?.failed ?? 0) > 0 && "text-destructive")}>
              {summary?.failed ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Callback Rate</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", callbackRateLow && "text-destructive")}>
              {summary?.callbackRate ?? 0}%
            </div>
            {callbackRateLow && (
              <p className="text-xs text-destructive">Below threshold</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Processing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
