/**
 * Admin Queue Dashboard
 *
 * Overview page for queue monitoring:
 * - Total statistics
 * - Alerts for failed jobs
 * - Quick links to LLM and Media monitors
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Database,
  Gauge,
  PlayCircle,
  Brain,
  Image,
  Video,
  Music,
  ArrowRight,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function AdminQueueDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(5000);
  const [deadlineDraft, setDeadlineDraft] = useState({
    adaptive: true,
    families: {
      python: { retryMinutes: 10, maxMinutes: 10 },
      image: { retryMinutes: 10, maxMinutes: 10 },
      audio: { retryMinutes: 10, maxMinutes: 10 },
      video: { retryMinutes: 60, maxMinutes: 60 },
      general: { retryMinutes: 10, maxMinutes: 10 },
    },
  });

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

  // Media stats for overview
  const mediaStats = trpc.queues.getMediaStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const mediaLimiterStatus = trpc.queues.getMediaLimiterStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  // Model stats for overview
  const modelStats = trpc.queues.getModelStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const deadlinePolicy = trpc.queues.getWorkerJobDeadlinePolicy.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const deadlinePolicyMutation = trpc.queues.updateWorkerJobDeadlinePolicy.useMutation({
    onSuccess: async () => {
      toast.success("Worker deadline policy saved");
      await deadlinePolicy.refetch();
    },
    onError: (error) => toast.error(error.message || "Unable to save worker deadline policy"),
  });

  useEffect(() => {
    if (deadlinePolicy.data?.settings) setDeadlineDraft(deadlinePolicy.data.settings);
  }, [deadlinePolicy.data]);

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
        <DashboardCard
          className="w-96"
          title="Access Denied"
          description="You need admin privileges to access this page."
        />
      </div>
    );
  }

  const isLoading = systemStatus.isLoading || limiterStatus.isLoading || queueStatus.isLoading;
  const limiters = limiterStatus.data?.limiters || [];
  const queues = queueStatus.data?.queues || [];
  const mediaModels = mediaStats.data?.models || [];
  const llmModels = modelStats.data?.models || [];
  const mediaLimiters = mediaLimiterStatus.data?.limiters || [];

  // Calculate totals
  const totalLLMRequests = llmModels.reduce((sum, m) => sum + m.requests, 0);
  const totalLLMCompleted = llmModels.reduce((sum, m) => sum + m.completed, 0);
  const totalLLMFailed = llmModels.reduce((sum, m) => sum + m.failed, 0);

  const totalMediaRequests = mediaModels.reduce((sum, m) => sum + m.requests, 0);
  const totalMediaCompleted = mediaModels.reduce((sum, m) => sum + m.completed, 0);
  const totalMediaFailed = mediaModels.reduce((sum, m) => sum + m.failed, 0);

  // Alerts
  const hasFailedJobs = (systemStatus.data?.queues.totalFailed || 0) > 0;
  const hasQueuedJobs = (systemStatus.data?.limiters.totalQueued || 0) > 5;

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
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Server className="h-6 w-6" />
                  Queue Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                  System overview and monitoring
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
                  mediaStats.refetch();
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
        {/* Alerts */}
        {(hasFailedJobs || hasQueuedJobs) && (
          <div className="space-y-2">
            {hasFailedJobs && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="text-red-700 dark:text-red-300">
                  {systemStatus.data?.queues.totalFailed} failed jobs require attention
                </span>
                <Link href="/admin/queues/llm">
                  <Button variant="outline" size="sm" className="ml-auto">
                    View LLM Monitor
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            )}
            {hasQueuedJobs && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                <Activity className="h-5 w-5 text-yellow-600" />
                <span className="text-yellow-700 dark:text-yellow-300">
                  High queue depth: {systemStatus.data?.limiters.totalQueued} jobs waiting
                </span>
              </div>
            )}
          </div>
        )}

        {/* System Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          {/* Active Requests */}
          <DashboardKpiCard icon={Activity} label="Active Requests" value={systemStatus.data?.limiters.totalRunning || 0} subLabel={<span className="text-xs text-muted-foreground">{systemStatus.data?.limiters.totalQueued || 0} queued</span>} />

          {/* Total Completed */}
          <DashboardKpiCard icon={CheckCircle} label="Completed" value={systemStatus.data?.queues.totalCompleted || 0} valueClassName="text-green-600" subLabel={<span className="text-xs text-muted-foreground">background jobs</span>} />

          {/* Total Failed */}
          <DashboardKpiCard icon={AlertTriangle} label="Failed" value={systemStatus.data?.queues.totalFailed || 0} valueClassName="text-red-600" subLabel={<span className="text-xs text-muted-foreground">requires attention</span>} />

          {/* Providers Count */}
          <DashboardKpiCard icon={Gauge} label="Limiters" value={limiters.length + mediaLimiters.length} subLabel={<span className="text-xs text-muted-foreground">{limiters.length} LLM, {mediaLimiters.length} Media</span>} />
        </div>

        {/* Monitor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LLM Monitor Card */}
          <DashboardCard
            className="hover:shadow-lg transition-shadow"
            title="LLM Monitor"
            description="Rate limiters, queues, and model usage"
            leading={<Brain className="h-5 w-5 text-blue-500" />}
            trailing={<Link href="/admin/queues/llm"><Button variant="outline" size="sm">Open<ArrowRight className="h-4 w-4 ml-1" /></Button></Link>}
          >
              <div className="space-y-4">
                {/* LLM Stats Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="text-xs text-blue-600 dark:text-blue-400">Requests</div>
                    <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
                      {totalLLMRequests.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-xs text-green-600 dark:text-green-400">Completed</div>
                    <div className="text-xl font-bold text-green-700 dark:text-green-300">
                      {totalLLMCompleted.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                    <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
                    <div className="text-xl font-bold text-red-700 dark:text-red-300">
                      {totalLLMFailed.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Active Limiters */}
                {limiters.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Active Providers</div>
                    <div className="flex flex-wrap gap-2">
                      {limiters.slice(0, 5).map((limiter) => (
                        <Badge key={limiter.provider} variant="outline">
                          {limiter.provider}
                          {(limiter.counts?.running || 0) > 0 && (
                            <span className="ml-1 text-blue-500">
                              ({limiter.counts.running})
                            </span>
                          )}
                        </Badge>
                      ))}
                      {limiters.length > 5 && (
                        <Badge variant="secondary">+{limiters.length - 5} more</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Models count */}
                <div className="text-sm text-muted-foreground">
                  {llmModels.length} models tracked across {limiters.length} providers
                </div>
              </div>
          </DashboardCard>

          {/* Media Monitor Card */}
          <DashboardCard
            className="hover:shadow-lg transition-shadow"
            title="Media Monitor"
            description="Image, video, and audio generation"
            leading={<PlayCircle className="h-5 w-5 text-purple-500" />}
            trailing={<Link href="/admin/queues/media"><Button variant="outline" size="sm">Open<ArrowRight className="h-4 w-4 ml-1" /></Button></Link>}
          >
              <div className="space-y-4">
                {/* Media Stats Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <div className="text-xs text-purple-600 dark:text-purple-400">Requests</div>
                    <div className="text-xl font-bold text-purple-700 dark:text-purple-300">
                      {totalMediaRequests.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-xs text-green-600 dark:text-green-400">Completed</div>
                    <div className="text-xl font-bold text-green-700 dark:text-green-300">
                      {totalMediaCompleted.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                    <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
                    <div className="text-xl font-bold text-red-700 dark:text-red-300">
                      {totalMediaFailed.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Media Type Breakdown */}
                <div>
                  <div className="text-sm font-medium mb-2">By Media Type</div>
                  <div className="flex flex-wrap gap-2">
                    {(['image', 'video', 'audio'] as const).map((type) => {
                      const typeModels = mediaModels.filter(m => m.mediaType === type);
                      const count = typeModels.reduce((sum, m) => sum + m.requests, 0);
                      const Icon = type === 'image' ? Image : type === 'video' ? Video : Music;
                      return (
                        <Badge key={type} variant="outline" className="gap-1">
                          <Icon className="h-3 w-3" />
                          <span className="capitalize">{type}</span>
                          <span className="text-muted-foreground">({count})</span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Models count */}
                <div className="text-sm text-muted-foreground">
                  {mediaModels.length} models tracked across {mediaLimiters.length} providers
                </div>
              </div>
          </DashboardCard>

          {/* Scheduled Jobs Card */}
          <DashboardCard
            className="hover:shadow-lg transition-shadow"
            title="Scheduled Jobs"
            description="Scheduled worker_jobs execution history"
            leading={<Clock className="h-5 w-5 text-teal-500" />}
            trailing={<Link href="/admin/scheduled-jobs"><Button variant="outline" size="sm">Open<ArrowRight className="h-4 w-4 ml-1" /></Button></Link>}
          >
              <p className="text-sm text-muted-foreground">
                View all scheduled tasks, their execution history, success rates, and performance metrics.
              </p>
          </DashboardCard>
        </div>

        {/* Background Queues Overview */}
        <DashboardCard
          title="Background Queues"
          description="Cloudflare canonical queues backed by the PostgreSQL outbox"
          leading={<Server className="h-5 w-5 text-slate-500" />}
        >
            {!queueStatus.data?.available ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Canonical queue metrics are unavailable</p>
                <p className="text-xs">Jobs are processed synchronously</p>
              </div>
            ) : queues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No queues initialized yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {queues.map((queue) => (
                  <div key={queue.name} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm truncate">{queue.name}</span>
                      {queue.paused ? (
                        <Badge variant="secondary" className="text-xs">Paused</Badge>
                      ) : (
                        <Badge variant="default" className="text-xs">Active</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Waiting: </span>
                        <span className="font-medium">{queue.counts.waiting}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active: </span>
                        <span className="font-medium">{queue.counts.active}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Done: </span>
                        <span className="font-medium text-green-600">{queue.counts.completed}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed: </span>
                        <span className={cn("font-medium", queue.counts.failed > 0 && "text-red-600")}>
                          {queue.counts.failed}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </DashboardCard>

        <DashboardCard
          title="Worker Retry Deadlines"
          description="Bound retry time by workload family; adaptive recommendations use the live backlog and recent successful execution data."
          leading={<Clock className="h-5 w-5 text-amber-500" />}
          trailing={
            <Button
              size="sm"
              onClick={() => deadlinePolicyMutation.mutate(deadlineDraft)}
              disabled={deadlinePolicyMutation.isPending || !deadlinePolicy.data}
            >
              {deadlinePolicyMutation.isPending ? "Saving…" : "Save policy"}
            </Button>
          }
        >
          <div className="space-y-4">
            {(deadlinePolicy.data?.settingsDegraded || deadlinePolicy.data?.metricsDegraded) && (
              <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Live policy settings or queue metrics are unavailable. Static safe defaults are active; adaptive recommendations are paused.
              </div>
            )}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="font-medium">Adaptive deadline recommendation</p>
                <p className="text-sm text-muted-foreground">Uses queue depth, concurrent users, throughput and p95 active execution time. It never exceeds the configured maximum.</p>
              </div>
              <Switch
                checked={deadlineDraft.adaptive}
                onCheckedChange={(adaptive) => setDeadlineDraft(current => ({ ...current, adaptive }))}
                aria-label="Enable adaptive worker retry deadline recommendations"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(["python", "image", "audio", "video", "general"] as const).map((family) => {
                const metric = deadlinePolicy.data?.metrics?.find(row => row.family === family);
                const title = family === "python" ? "Python / Skill" : family === "image" ? "Image" : family === "audio" ? "Audio" : family === "video" ? "Video" : "Other jobs";
                const maximum = deadlinePolicy.data?.hardMaximumMinutes?.[family] ?? (family === "python" || family === "image" ? 60 : 120);
                const update = (field: "retryMinutes" | "maxMinutes", value: string) => {
                  const parsed = Number.parseInt(value, 10);
                  if (!Number.isFinite(parsed)) return;
                  setDeadlineDraft(current => ({
                    ...current,
                    families: {
                      ...current.families,
                      [family]: { ...current.families[family], [field]: parsed },
                    },
                  }));
                };
                return (
                  <section key={family} className="rounded-lg border p-4 space-y-3">
                    <h3 className="font-semibold">{title}</h3>
                    <label className="block space-y-1 text-sm">
                      <span>Retry deadline (minutes)</span>
                      <Input
                        type="number"
                        min={1}
                        max={deadlineDraft.families[family].maxMinutes}
                        value={deadlineDraft.families[family].retryMinutes}
                        onChange={(event) => update("retryMinutes", event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span>Maximum under adaptive mode (minutes, hard cap {maximum})</span>
                      <Input
                        type="number"
                        min={deadlineDraft.families[family].retryMinutes}
                        max={maximum}
                        value={deadlineDraft.families[family].maxMinutes}
                        onChange={(event) => update("maxMinutes", event.target.value)}
                      />
                    </label>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Queued: {metric?.queued ?? 0} · Active: {metric?.active ?? 0} · Users: {metric?.activeUsers ?? 0}</p>
                      <p>Average queue wait: {metric?.avgQueueWaitMs == null ? "not enough data" : `${Math.ceil(metric.avgQueueWaitMs / 60_000)} min`}</p>
                      <p>p95 queue wait: {metric?.p95QueueWaitMs == null ? "not enough data" : `${Math.ceil(metric.p95QueueWaitMs / 60_000)} min`}</p>
                      <p>Average worker time: {metric?.avgExecutionMs == null ? "not enough data" : `${Math.ceil(metric.avgExecutionMs / 60_000)} min`}</p>
                      <p>p95 worker time: {metric?.p95ExecutionMs == null ? "not enough data" : `${Math.ceil(metric.p95ExecutionMs / 60_000)} min`}</p>
                      <p>Average total time: {metric?.avgEndToEndMs == null ? "not enough data" : `${Math.ceil(metric.avgEndToEndMs / 60_000)} min`}</p>
                      <p>p95 total time: {metric?.p95EndToEndMs == null ? "not enough data" : `${Math.ceil(metric.p95EndToEndMs / 60_000)} min`}</p>
                      <p>Recommended now: {metric?.recommendedRetryMinutes ?? deadlineDraft.families[family].retryMinutes} min ({metric?.confidence ?? "low"} confidence)</p>
                      {metric?.capApplied && <p className="font-medium text-amber-700">Observed load exceeds this maximum; increase the cap or scale workers.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              External provider waiting is excluded from worker execution time. Policy changes apply to newly admitted jobs; existing jobs keep their recorded deadline.
            </p>
          </div>
        </DashboardCard>

        {/* Quick Links */}
        <div className="flex items-center justify-center gap-4 pt-4">
          <Link href="/admin/queues/llm">
            <Button variant="outline" className="gap-2">
              <Brain className="h-4 w-4" />
              LLM Monitor
            </Button>
          </Link>
          <Link href="/admin/queues/media">
            <Button variant="outline" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Media Monitor
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
