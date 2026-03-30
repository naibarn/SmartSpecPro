/**
 * Storage Panel
 *
 * Displays R2 storage usage by prefix with caching indicator.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, HardDrive, FolderOpen, Database } from "lucide-react";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

interface StoragePanelProps {
  refreshInterval: number | null;
}

export default function StoragePanel({ refreshInterval }: StoragePanelProps) {
  const { data, isLoading, error } = trpc.adminOps.storageStats.useQuery(undefined, {
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
          <p className="text-destructive">Failed to load storage stats: {error.message}</p>
        </div>
      </DashboardCard>
    );
  }

  const maxSizeGb = Math.max(...(data?.prefixes?.map((p: { sizeGb: number }) => p.sizeGb) ?? [1]), 0.001);

  return (
    <div className="space-y-4">
      {/* Total Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashboardKpiCard
          icon={Database}
          label="Total Objects"
          value={data?.totalObjects?.toLocaleString() ?? 0}
        />
        <DashboardKpiCard
          icon={HardDrive}
          label="Total Size"
          value={`${data?.totalSizeGb ?? 0} GB`}
          subLabel={
            data?.cachedAt ? (
              <span className="text-xs text-muted-foreground">
                Cached at: {new Date(data.cachedAt).toLocaleTimeString()}
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Per-Prefix Breakdown */}
      <DashboardCard title="Storage by Prefix" titleClassName="text-sm font-medium">
        <div>
          {data?.prefixes && data.prefixes.length > 0 ? (
            <div className="space-y-4">
              {data.prefixes.map((prefix: { name: string; objectCount: number; sizeGb: number }) => (
                <div key={prefix.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{prefix.name}/</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{prefix.objectCount.toLocaleString()} objects</Badge>
                      <Badge variant="outline">{prefix.sizeGb} GB</Badge>
                    </div>
                  </div>
                  <Progress
                    value={maxSizeGb > 0 ? (prefix.sizeGb / maxSizeGb) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No storage data available.</p>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
