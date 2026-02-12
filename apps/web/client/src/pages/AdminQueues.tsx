/**
 * Admin Queue Monitoring Page
 *
 * Provides monitoring and management for:
 * - BullMQ background job queues
 * - Bottleneck rate limiters per provider
 * - Failed job management
 * - Queue statistics and health
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Server,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Zap,
  Database,
  Gauge,
  PlayCircle,
  Image,
  Video,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminQueues() {
  const { user, loading: authLoading } = useAuth();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(5000);
  const [historyMinutes, setHistoryMinutes] = useState<number>(60);

  // Queries
  const systemStatus = trpc.queues.getSystemStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const limiterStatus = trpc.queues.getLimiterStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const queueStatus = trpc.queues.getQueueStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const providerConfigs = trpc.queues.getProviderConfigs.useQuery();

  // History query
  const historyData = trpc.queues.getAggregatedHistory.useQuery(
    { minutes: historyMinutes, bucketSize: historyMinutes <= 60 ? 5 : 15 },
    { refetchInterval: 60000 } // Refresh every minute
  );

  // Model usage stats (LLM)
  const modelStats = trpc.queues.getModelStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  // Media usage stats
  const mediaStats = trpc.queues.getMediaStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  // Media limiter status
  const mediaLimiterStatus = trpc.queues.getMediaLimiterStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  // Mutations
  const pauseQueueMutation = trpc.queues.pauseQueue.useMutation({
    onSuccess: () => {
      toast.success("Queue paused");
      queueStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resumeQueueMutation = trpc.queues.resumeQueue.useMutation({
    onSuccess: () => {
      toast.success("Queue resumed");
      queueStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const retryJobsMutation = trpc.queues.retryJobs.useMutation({
    onSuccess: (data) => {
      toast.success(`Retried ${data.retried} jobs`);
      queueStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const clearStaleMutation = trpc.queues.clearStaleJobs.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.cleared} stale jobs`);
      queueStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetLimiterMutation = trpc.queues.resetLimiter.useMutation({
    onSuccess: () => {
      toast.success("Limiter reset");
      limiterStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const clearWaitingMutation = trpc.queues.clearWaitingJobs.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.cleared} waiting jobs`);
      limiterStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auth check
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need admin privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isLoading = systemStatus.isLoading || limiterStatus.isLoading || queueStatus.isLoading;
  const redis = systemStatus.data?.redis;
  const limiters = limiterStatus.data?.limiters || [];
  const queues = queueStatus.data?.queues || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Server className="h-6 w-6" />
                  Queue Monitoring
                </h1>
                <p className="text-sm text-muted-foreground">
                  Monitor and manage LLM queues and rate limiters
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRefreshInterval(refreshInterval ? null : 5000)}
              >
                {refreshInterval ? (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Pause Auto-Refresh
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Enable Auto-Refresh
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  systemStatus.refetch();
                  limiterStatus.refetch();
                  queueStatus.refetch();
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Redis Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Redis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {redis?.connected ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-green-600">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="font-semibold text-red-600">Disconnected</span>
                  </>
                )}
              </div>
              {redis?.error && (
                <p className="text-xs text-muted-foreground mt-1 truncate" title={redis.error}>
                  {redis.error}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Active Requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Active Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {systemStatus.data?.limiters.totalRunning || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {systemStatus.data?.limiters.totalQueued || 0} queued
              </p>
            </CardContent>
          </Card>

          {/* Completed Jobs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {systemStatus.data?.queues.totalCompleted || 0}
              </div>
              <p className="text-xs text-muted-foreground">background jobs</p>
            </CardContent>
          </Card>

          {/* Failed Jobs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {systemStatus.data?.queues.totalFailed || 0}
              </div>
              <p className="text-xs text-muted-foreground">requires attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="limiters">
          <TabsList>
            <TabsTrigger value="limiters" className="gap-2">
              <Gauge className="h-4 w-4" />
              Rate Limiters
            </TabsTrigger>
            <TabsTrigger value="queues" className="gap-2">
              <Server className="h-4 w-4" />
              Background Queues
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Zap className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <Activity className="h-4 w-4" />
              LLM Models
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Media
            </TabsTrigger>
          </TabsList>

          {/* Rate Limiters Tab */}
          <TabsContent value="limiters" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Provider Rate Limiters</CardTitle>
                <CardDescription>
                  Real-time status of rate limiting per LLM provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!limiterStatus.data?.available && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Redis not available - using in-memory limiters</p>
                    <p className="text-xs">Rate limits are not shared across instances</p>
                  </div>
                )}

                {limiters.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active rate limiters</p>
                    <p className="text-xs">Limiters are created on first request to each provider</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {limiters.map((limiter) => {
                      const maxConcurrent = limiter.config?.maxConcurrent || 5;
                      const running = limiter.counts?.running || 0;
                      const queued = limiter.counts?.queued || 0;
                      const utilization = (running / maxConcurrent) * 100;

                      return (
                        <div key={limiter.provider} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="font-semibold">{limiter.provider}</div>
                              <Badge variant={running > 0 ? "default" : "secondary"}>
                                {running}/{maxConcurrent} active
                              </Badge>
                              {queued > 0 && (
                                <Badge variant="outline" className="text-yellow-600">
                                  {queued} queued
                                </Badge>
                              )}
                              {limiter.counts?.reservoir !== null && (
                                <Badge variant="outline" className="text-blue-600">
                                  {limiter.counts.reservoir} reservoir
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                    Reset
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Reset Rate Limiter</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will reset the rate limiter for {limiter.provider}.
                                      Any queued jobs will be dropped.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => resetLimiterMutation.mutate({ provider: limiter.provider })}
                                    >
                                      Reset
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              {queued > 0 && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => clearWaitingMutation.mutate({ provider: limiter.provider })}
                                  disabled={clearWaitingMutation.isPending}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Clear Queue
                                </Button>
                              )}
                            </div>
                          </div>

                          <Progress value={utilization} className="h-2 mb-2" />

                          <div className="grid grid-cols-4 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Min Time:</span>{" "}
                              {limiter.config?.minTime || 200}ms
                            </div>
                            <div>
                              <span className="font-medium">Done:</span>{" "}
                              {limiter.stats?.done || 0}
                            </div>
                            <div>
                              <span className="font-medium">Failed:</span>{" "}
                              {limiter.stats?.failed || 0}
                            </div>
                            <div>
                              <span className="font-medium">Avg Wait:</span>{" "}
                              {limiter.stats?.avgWaitTime || 0}ms
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Background Queues Tab */}
          <TabsContent value="queues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Background Job Queues</CardTitle>
                <CardDescription>
                  BullMQ queues for async processing (credits, usage, skills)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!queueStatus.data?.available && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Redis not available - background queues disabled</p>
                    <p className="text-xs">Jobs are processed synchronously</p>
                  </div>
                )}

                {queues.length === 0 && queueStatus.data?.available && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No queues initialized yet</p>
                    <p className="text-xs">Queues are created on first background job</p>
                  </div>
                )}

                {queues.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Queue</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Waiting</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Delayed</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead className="text-right">Completed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queues.map((queue) => (
                        <TableRow key={queue.name}>
                          <TableCell className="font-medium">{queue.name}</TableCell>
                          <TableCell>
                            {queue.paused ? (
                              <Badge variant="secondary">Paused</Badge>
                            ) : (
                              <Badge variant="default">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{queue.counts.waiting}</TableCell>
                          <TableCell className="text-right">{queue.counts.active}</TableCell>
                          <TableCell className="text-right">{queue.counts.delayed}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn(queue.counts.failed > 0 && "text-red-600 font-medium")}>
                              {queue.counts.failed}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {queue.counts.completed}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {queue.paused ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => resumeQueueMutation.mutate({ queue: queue.name })}
                                  disabled={resumeQueueMutation.isPending}
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => pauseQueueMutation.mutate({ queue: queue.name })}
                                  disabled={pauseQueueMutation.isPending}
                                >
                                  <Pause className="h-3 w-3" />
                                </Button>
                              )}

                              {queue.counts.failed > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => retryJobsMutation.mutate({ queue: queue.name })}
                                  disabled={retryJobsMutation.isPending}
                                  title="Retry all failed jobs"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              )}

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" title="Clear stale jobs">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Clear Stale Jobs</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will move jobs older than 5 minutes to failed.
                                      Use this to recover from deadlocks.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => clearStaleMutation.mutate({ queue: queue.name })}
                                    >
                                      Clear Stale
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Provider Rate Limit Configurations</CardTitle>
                <CardDescription>
                  Default rate limiting settings per provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Max Concurrent</TableHead>
                      <TableHead className="text-right">Min Time (ms)</TableHead>
                      <TableHead className="text-right">Reservoir</TableHead>
                      <TableHead className="text-right">Refresh Interval</TableHead>
                      <TableHead className="text-right">Free Multiplier</TableHead>
                      <TableHead className="text-right">Timeout (ms)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerConfigs.data?.configs.map((config) => (
                      <TableRow key={config.provider}>
                        <TableCell className="font-medium">{config.provider}</TableCell>
                        <TableCell className="text-right">{config.maxConcurrent}</TableCell>
                        <TableCell className="text-right">{config.minTime}</TableCell>
                        <TableCell className="text-right">{config.reservoir || "-"}</TableCell>
                        <TableCell className="text-right">
                          {config.reservoirRefreshInterval
                            ? `${config.reservoirRefreshInterval / 1000}s`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">{config.freeModelMultiplier}x</TableCell>
                        <TableCell className="text-right">
                          {config.timeout ? `${config.timeout / 1000}s` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Environment Configuration</CardTitle>
                <CardDescription>
                  Required environment variables for queue system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">REDIS_URL=</span>
                    <span>{redis?.url || "redis://localhost:6379"}</span>
                    {redis?.connected ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Set REDIS_URL to enable distributed rate limiting and background job queues.
                    Without Redis, the system falls back to in-memory limiters.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Queue History</CardTitle>
                    <CardDescription>
                      Usage patterns over time
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="px-3 py-1 border rounded-md text-sm"
                      value={historyMinutes}
                      onChange={(e) => setHistoryMinutes(Number(e.target.value))}
                    >
                      <option value={30}>Last 30 minutes</option>
                      <option value={60}>Last 1 hour</option>
                      <option value={180}>Last 3 hours</option>
                      <option value={360}>Last 6 hours</option>
                      <option value={720}>Last 12 hours</option>
                      <option value={1440}>Last 24 hours</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => historyData.refetch()}
                      disabled={historyData.isLoading}
                    >
                      {historyData.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {historyData.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : historyData.data?.buckets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No history data yet. Data collection starts when the server runs.</p>
                    <p className="text-xs mt-1">Snapshots are taken every minute.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                        <div className="text-sm text-green-600 dark:text-green-400">Completed</div>
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                          {historyData.data?.summary.totalCompleted ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                        <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
                        <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                          {historyData.data?.summary.totalFailed ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                        <div className="text-sm text-yellow-600 dark:text-yellow-400">Peak Waiting</div>
                        <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                          {historyData.data?.summary.peakWaiting ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <div className="text-sm text-blue-600 dark:text-blue-400">Peak Active</div>
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                          {historyData.data?.summary.peakActive ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                        <div className="text-sm text-purple-600 dark:text-purple-400">Avg Rate/bucket</div>
                        <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                          {historyData.data?.summary.avgProcessingRate ?? 0}
                        </div>
                      </div>
                    </div>

                    {/* Simple Bar Chart */}
                    <div>
                      <h4 className="font-medium mb-3">Completed Jobs Over Time</h4>
                      <div className="h-40 flex items-end gap-1">
                        {historyData.data?.buckets.map((bucket, i) => {
                          const maxVal = Math.max(
                            ...historyData.data!.buckets.map(b => b.completed + b.failed),
                            1
                          );
                          const completedHeight = (bucket.completed / maxVal) * 100;
                          const failedHeight = (bucket.failed / maxVal) * 100;
                          const time = new Date(bucket.timestamp);

                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col justify-end items-center gap-0.5 group relative"
                            >
                              {/* Tooltip */}
                              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg z-10 whitespace-nowrap">
                                <div className="font-medium">
                                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-green-600">Completed: {bucket.completed}</div>
                                <div className="text-red-600">Failed: {bucket.failed}</div>
                                <div className="text-muted-foreground">Avg Waiting: {bucket.avgWaiting}</div>
                              </div>

                              {/* Bars */}
                              {bucket.failed > 0 && (
                                <div
                                  className="w-full bg-red-500 rounded-t-sm min-h-[2px]"
                                  style={{ height: `${failedHeight}%` }}
                                />
                              )}
                              <div
                                className="w-full bg-green-500 rounded-t-sm min-h-[2px]"
                                style={{ height: `${completedHeight}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>
                          {historyData.data?.buckets[0]
                            ? new Date(historyData.data.buckets[0].timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                        <span>
                          {historyData.data?.buckets[historyData.data.buckets.length - 1]
                            ? new Date(
                                historyData.data.buckets[historyData.data.buckets.length - 1].timestamp
                              ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                      </div>
                    </div>

                    {/* Activity Timeline */}
                    <div>
                      <h4 className="font-medium mb-3">Queue Activity (Waiting + Active)</h4>
                      <div className="h-24 flex items-end gap-1">
                        {historyData.data?.buckets.map((bucket, i) => {
                          const maxVal = Math.max(
                            ...historyData.data!.buckets.map(b => b.avgWaiting + b.avgActive),
                            1
                          );
                          const waitingHeight = (bucket.avgWaiting / maxVal) * 100;
                          const activeHeight = (bucket.avgActive / maxVal) * 100;

                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col justify-end items-center gap-0.5"
                            >
                              {bucket.avgWaiting > 0 && (
                                <div
                                  className="w-full bg-yellow-400 rounded-t-sm min-h-[2px]"
                                  style={{ height: `${waitingHeight}%` }}
                                />
                              )}
                              <div
                                className="w-full bg-blue-500 rounded-t-sm min-h-[2px]"
                                style={{ height: `${activeHeight}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-500 rounded" /> Active
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-yellow-400 rounded" /> Waiting
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Model Usage Statistics</CardTitle>
                <CardDescription>
                  Usage breakdown by LLM provider and model
                </CardDescription>
              </CardHeader>
              <CardContent>
                {modelStats.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !modelStats.data?.models.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No model usage data yet.</p>
                    <p className="text-xs mt-1">Data will appear after LLM requests are made.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary by Provider */}
                    <div>
                      <h4 className="font-medium mb-3">Usage by Provider</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(
                          modelStats.data.models.reduce((acc, m) => {
                            if (!acc[m.provider]) {
                              acc[m.provider] = { requests: 0, completed: 0, failed: 0, models: 0 };
                            }
                            acc[m.provider].requests += m.requests;
                            acc[m.provider].completed += m.completed;
                            acc[m.provider].failed += m.failed;
                            acc[m.provider].models++;
                            return acc;
                          }, {} as Record<string, { requests: number; completed: number; failed: number; models: number }>)
                        ).map(([provider, stats]) => (
                          <div key={provider} className="p-3 border rounded-lg">
                            <div className="font-medium text-sm truncate">{provider}</div>
                            <div className="text-2xl font-bold">{stats.requests.toLocaleString()}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="text-green-600">{stats.completed} ok</span>
                              <span className="text-red-600">{stats.failed} fail</span>
                              <span>• {stats.models} models</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Model Table */}
                    <div>
                      <h4 className="font-medium mb-3">All Models</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Model</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead className="text-right">Requests</TableHead>
                            <TableHead className="text-right">Success Rate</TableHead>
                            <TableHead className="text-right">Input Tokens</TableHead>
                            <TableHead className="text-right">Output Tokens</TableHead>
                            <TableHead className="text-right">Last Used</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {modelStats.data.models
                            .sort((a, b) => b.requests - a.requests)
                            .map((model) => (
                              <TableRow key={`${model.provider}:${model.model}`}>
                                <TableCell className="font-mono text-sm">
                                  {model.model.length > 30
                                    ? model.model.substring(0, 30) + '...'
                                    : model.model}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{model.provider}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {model.requests.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={cn(
                                      model.successRate >= 95
                                        ? 'text-green-600'
                                        : model.successRate >= 80
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    )}
                                  >
                                    {model.successRate}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {model.totalInputTokens.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {model.totalOutputTokens.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {model.lastUsed
                                    ? new Date(model.lastUsed).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Media Tab */}
          <TabsContent value="media" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Media Generation Statistics</CardTitle>
                <CardDescription>
                  Usage breakdown by media provider, model, and type (image/video/audio)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mediaStats.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !mediaStats.data?.models.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PlayCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No media usage data yet.</p>
                    <p className="text-xs mt-1">Data will appear after media generation requests are made.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Media Type Summary */}
                    <div>
                      <h4 className="font-medium mb-3">Usage by Media Type</h4>
                      <div className="grid grid-cols-3 gap-3">
                        {(['image', 'video', 'audio'] as const).map((type) => {
                          const typeModels = mediaStats.data!.models.filter(m => m.mediaType === type);
                          const totalRequests = typeModels.reduce((sum, m) => sum + m.requests, 0);
                          const totalCompleted = typeModels.reduce((sum, m) => sum + m.completed, 0);
                          const totalFailed = typeModels.reduce((sum, m) => sum + m.failed, 0);
                          const Icon = type === 'image' ? Image : type === 'video' ? Video : Music;

                          return (
                            <div key={type} className="p-4 border rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium capitalize">{type}</span>
                              </div>
                              <div className="text-2xl font-bold">{totalRequests.toLocaleString()}</div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="text-green-600">{totalCompleted} ok</span>
                                <span className="text-red-600">{totalFailed} fail</span>
                                <span>• {typeModels.length} models</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Media Provider Summary */}
                    <div>
                      <h4 className="font-medium mb-3">Usage by Provider</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(
                          mediaStats.data.models.reduce((acc, m) => {
                            if (!acc[m.provider]) {
                              acc[m.provider] = { requests: 0, completed: 0, failed: 0, models: 0, credits: 0 };
                            }
                            acc[m.provider].requests += m.requests;
                            acc[m.provider].completed += m.completed;
                            acc[m.provider].failed += m.failed;
                            acc[m.provider].credits += m.totalCreditsUsed;
                            acc[m.provider].models++;
                            return acc;
                          }, {} as Record<string, { requests: number; completed: number; failed: number; models: number; credits: number }>)
                        ).map(([provider, stats]) => (
                          <div key={provider} className="p-3 border rounded-lg">
                            <div className="font-medium text-sm truncate">{provider}</div>
                            <div className="text-2xl font-bold">{stats.requests.toLocaleString()}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="text-green-600">{stats.completed} ok</span>
                              <span className="text-red-600">{stats.failed} fail</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {stats.credits.toLocaleString()} credits
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Media Limiter Status */}
                    {mediaLimiterStatus.data?.limiters && mediaLimiterStatus.data.limiters.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3">Rate Limiter Status</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {mediaLimiterStatus.data.limiters.map((limiter) => (
                            <div key={limiter.provider} className="p-3 border rounded-lg">
                              <div className="font-medium text-sm">{limiter.provider}</div>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Running: </span>
                                  <span className="font-medium">{limiter.running}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Queued: </span>
                                  <span className="font-medium">{limiter.queued}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Done: </span>
                                  <span className="font-medium text-green-600">{limiter.done}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Failed: </span>
                                  <span className="font-medium text-red-600">{limiter.failed}</span>
                                </div>
                              </div>
                              {limiter.avgWaitTime > 0 && (
                                <div className="text-xs text-muted-foreground mt-2">
                                  Avg wait: {limiter.avgWaitTime}ms
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Media Models Table */}
                    <div>
                      <h4 className="font-medium mb-3">All Media Models</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Model</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Requests</TableHead>
                            <TableHead className="text-right">Success Rate</TableHead>
                            <TableHead className="text-right">Credits Used</TableHead>
                            <TableHead className="text-right">Last Used</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mediaStats.data.models
                            .sort((a, b) => b.requests - a.requests)
                            .map((model) => (
                              <TableRow key={`${model.provider}:${model.model}`}>
                                <TableCell className="font-mono text-sm">
                                  {model.model.length > 25
                                    ? model.model.substring(0, 25) + '...'
                                    : model.model}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{model.provider}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      model.mediaType === 'image' && 'bg-blue-100 text-blue-800',
                                      model.mediaType === 'video' && 'bg-purple-100 text-purple-800',
                                      model.mediaType === 'audio' && 'bg-green-100 text-green-800'
                                    )}
                                  >
                                    {model.mediaType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {model.requests.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={cn(
                                      model.successRate >= 95
                                        ? 'text-green-600'
                                        : model.successRate >= 80
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    )}
                                  >
                                    {model.successRate}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {model.totalCreditsUsed.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {model.lastUsed
                                    ? new Date(model.lastUsed).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
