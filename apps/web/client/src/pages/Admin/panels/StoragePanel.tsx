/**
 * Storage Panel
 *
 * Displays R2 storage usage by prefix with caching indicator.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, HardDrive, FolderOpen, Database } from "lucide-react";

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
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">Failed to load storage stats: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const maxSizeGb = Math.max(...(data?.prefixes?.map((p: { sizeGb: number }) => p.sizeGb) ?? [1]), 0.001);

  return (
    <div className="space-y-4">
      {/* Total Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Objects</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalObjects?.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalSizeGb ?? 0} GB</div>
            {data?.cachedAt && (
              <p className="text-xs text-muted-foreground">
                Cached at: {new Date(data.cachedAt).toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-Prefix Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Storage by Prefix</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
