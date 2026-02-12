/**
 * Admin Queue Dashboard
 *
 * Overview page for queue monitoring:
 * - Redis connection status
 * - Total statistics
 * - Alerts for failed jobs
 * - Quick links to LLM and Media monitors
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function AdminQueueDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(5000);

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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

          {/* Total Completed */}
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

          {/* Total Failed */}
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

          {/* Providers Count */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Limiters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {limiters.length + mediaLimiters.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {limiters.length} LLM, {mediaLimiters.length} Media
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monitor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LLM Monitor Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-blue-500" />
                    LLM Monitor
                  </CardTitle>
                  <CardDescription>
                    Rate limiters, queues, and model usage
                  </CardDescription>
                </div>
                <Link href="/admin/queues/llm">
                  <Button variant="outline" size="sm">
                    Open
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Media Monitor Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <PlayCircle className="h-5 w-5 text-purple-500" />
                    Media Monitor
                  </CardTitle>
                  <CardDescription>
                    Image, video, and audio generation
                  </CardDescription>
                </div>
                <Link href="/admin/queues/media">
                  <Button variant="outline" size="sm">
                    Open
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        {/* Background Queues Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Background Queues
            </CardTitle>
            <CardDescription>
              BullMQ job queues for async processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!queueStatus.data?.available ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Redis not available - background queues disabled</p>
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
          </CardContent>
        </Card>

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
