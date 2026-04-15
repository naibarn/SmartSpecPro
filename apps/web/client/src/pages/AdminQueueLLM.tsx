/**
 * Admin LLM Queue Monitor
 *
 * Detailed monitoring for LLM-related queues:
 * - Rate limiters per provider
 * - Background job queues
 * - Model usage statistics
 * - Configuration and history
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
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
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function AdminQueueLLM() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(5000);
  const [historyMinutes, setHistoryMinutes] = useState<number>(60);

  // Queries
  const systemStatus = trpc.queues.getSystemStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const limiterStatus = trpc.queues.getLimiterStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const documentOcrLimiterStatus = trpc.queues.getDocumentOcrLimiterStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const queueStatus = trpc.queues.getQueueStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const providerConfigs = trpc.queues.getProviderConfigs.useQuery();

  // History query
  const historyData = trpc.queues.getAggregatedHistory.useQuery(
    { minutes: historyMinutes, bucketSize: historyMinutes <= 60 ? 5 : 15 },
    { refetchInterval: 60000 }
  );

  // Model usage stats
  const modelStats = trpc.queues.getModelStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  // Mutations
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
        <DashboardCard className="w-96">
          <div>
            <h3>Access Denied</h3>
            <p>
              You need admin privileges to access this page.
            </p>
          </div>
        </DashboardCard>
      </div>
    );
  }

  const isLoading = systemStatus.isLoading || limiterStatus.isLoading || queueStatus.isLoading;
  const redis = systemStatus.data?.redis;
  const limiters = limiterStatus.data?.limiters || [];
  const queues = queueStatus.data?.queues || [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card shrink-0">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Dashboard
              </Button>
              <Link href="/admin/queues">
                <Button variant="outline" size="sm">
                  Queue Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Brain className="h-6 w-6 text-blue-500" />
                  LLM Queue Monitor
                </h1>
                <p className="text-sm text-muted-foreground">
                  Rate limiters, queues, and model usage
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
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Auto-Refresh
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
                  modelStats.refetch();
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

      <div className="flex-1 overflow-auto px-4 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Redis
              </h3>
            </div>
            <div>
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
            </div>
          </DashboardCard>

          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Active
              </h3>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {systemStatus.data?.limiters.totalRunning || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {systemStatus.data?.limiters.totalQueued || 0} queued
              </p>
            </div>
          </DashboardCard>

          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed
              </h3>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {systemStatus.data?.limiters.totalDone || 0}
              </div>
            </div>
          </DashboardCard>

          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Failed
              </h3>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {systemStatus.data?.limiters.totalFailed || 0}
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="limiters">
          <TabsList>
            <TabsTrigger value="limiters" className="gap-2">
              <Gauge className="h-4 w-4" />
              Rate Limiters
            </TabsTrigger>
            <TabsTrigger value="queues" className="gap-2">
              <Server className="h-4 w-4" />
              Queues
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <Activity className="h-4 w-4" />
              Models
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Zap className="h-4 w-4" />
              Config
            </TabsTrigger>
          </TabsList>

          {/* Rate Limiters Tab */}
          <TabsContent value="limiters" className="space-y-4">
            <DashboardCard>
              <div>
                <h3>Provider Rate Limiters</h3>
                <p>
                  Real-time status of rate limiting per LLM provider
                </p>
              </div>
              <div>
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

                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Document OCR Rate Limiter</h4>
                      <p className="text-sm text-muted-foreground">
                        Typhoon OCR 1.5 is enforced by the Python OCR service and capped at 20 requests per minute system-wide.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      External limiter
                    </Badge>
                  </div>

                  {documentOcrLimiterStatus.data?.limiters?.length ? (
                    <div className="mt-4 space-y-4">
                      {documentOcrLimiterStatus.data.limiters.map((limiter) => {
                        const usagePercent = limiter.limit > 0 ? (limiter.current / limiter.limit) * 100 : 0;
                        const isNearLimit = usagePercent >= 80;
                        const isAtLimit = limiter.remaining === 0;
                        return (
                          <div key={limiter.provider} className="rounded-lg border border-white bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold">{limiter.displayName}</div>
                                <Badge variant="outline">provider: {limiter.provider}</Badge>
                                <Badge variant={limiter.redisAvailable ? "secondary" : "destructive"}>
                                  {limiter.redisAvailable ? "Redis connected" : "Redis unavailable"}
                                </Badge>
                                <Badge variant={isAtLimit ? "destructive" : isNearLimit ? "outline" : "secondary"}>
                                  {isAtLimit ? "At limit" : isNearLimit ? "Near limit" : "Healthy"}
                                </Badge>
                              </div>
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                Managed externally
                              </Badge>
                            </div>

                            <Progress value={Math.min(100, usagePercent)} className="mt-3 h-2" />

                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-muted-foreground md:grid-cols-4">
                              <div>
                                <span className="font-medium text-slate-700">Current:</span> {limiter.current}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Remaining:</span> {limiter.remaining}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Limit:</span> {limiter.limit}/min
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Retry after:</span>{" "}
                                {limiter.retryAfterSeconds != null ? `${limiter.retryAfterSeconds}s` : "n/a"}
                              </div>
                            </div>

                            <div className="mt-3 text-xs text-muted-foreground">
                              {limiter.note}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">
                      Document OCR limiter status is not available yet.
                    </div>
                  )}
                </div>
              </div>
            </DashboardCard>
          </TabsContent>

          {/* Background Queues Tab */}
          <TabsContent value="queues" className="space-y-4">
            <DashboardCard>
              <div>
                <h3>Background Job Queues</h3>
                <p>
                  Cloud Tasks queues for async processing
                </p>
              </div>
              <div>
                {!queueStatus.data?.available && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Redis not available - background queues disabled</p>
                  </div>
                )}

                {queues.length === 0 && queueStatus.data?.available && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No queues initialized yet</p>
                  </div>
                )}

                {queues.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Queue</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Tasks</TableHead>
                        <TableHead className="text-right">Dispatch Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queues.map((queue) => (
                        <TableRow key={queue.name}>
                          <TableCell className="font-medium">{queue.name}</TableCell>
                          <TableCell>
                            <Badge variant="default">Active</Badge>
                          </TableCell>
                          <TableCell className="text-right">{queue.counts.waiting}</TableCell>
                          <TableCell className="text-right">
                            {queue.cloudTasks?.dispatchRate ?? 0}/s
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </DashboardCard>
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models" className="space-y-4">
            <DashboardCard>
              <div>
                <h3>Model Usage Statistics</h3>
                <p>
                  Usage breakdown by LLM provider and model
                </p>
              </div>
              <div>
                {modelStats.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !modelStats.data?.models.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No model usage data yet.</p>
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
              </div>
            </DashboardCard>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <DashboardCard>
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3>Queue History</h3>
                    <p>
                      Usage patterns over time
                    </p>
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
              </div>
              <div>
                {historyData.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : historyData.data?.buckets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No history data yet.</p>
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
                        <div className="text-sm text-purple-600 dark:text-purple-400">Avg Rate</div>
                        <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                          {historyData.data?.summary.avgProcessingRate ?? 0}
                        </div>
                      </div>
                    </div>

                    {/* Chart */}
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
                              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg z-10 whitespace-nowrap">
                                <div className="font-medium">
                                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-green-600">Completed: {bucket.completed}</div>
                                <div className="text-red-600">Failed: {bucket.failed}</div>
                              </div>

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
                    </div>
                  </div>
                )}
              </div>
            </DashboardCard>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <DashboardCard>
              <div>
                <h3>Provider Rate Limit Configurations</h3>
                <p>
                  Default rate limiting settings per provider
                </p>
              </div>
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Max Concurrent</TableHead>
                      <TableHead className="text-right">Min Time (ms)</TableHead>
                      <TableHead className="text-right">Reservoir</TableHead>
                      <TableHead className="text-right">Refresh Interval</TableHead>
                      <TableHead className="text-right">Free Multiplier</TableHead>
                      <TableHead className="text-right">Timeout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerConfigs.data?.configs.map((config) => (
                      <TableRow key={config.provider}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{config.displayName ?? config.provider}</span>
                            {config.managedExternally ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                External
                              </Badge>
                            ) : null}
                          </div>
                          {config.displayName ? (
                            <div className="text-xs text-muted-foreground">{config.provider}</div>
                          ) : null}
                        </TableCell>
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
              </div>
            </DashboardCard>

            <DashboardCard>
              <div>
                <h3>Environment Configuration</h3>
              </div>
              <div>
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
                </div>
              </div>
            </DashboardCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
