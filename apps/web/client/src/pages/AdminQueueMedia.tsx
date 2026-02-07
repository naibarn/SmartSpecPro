/**
 * Admin Media Queue Monitor
 *
 * Detailed monitoring for Media generation:
 * - Media rate limiters (kie.ai, replicate, etc.)
 * - Usage by media type (image/video/audio)
 * - Provider and model statistics
 * - Configuration
 */

import { useState } from "react";
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
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Zap,
  Gauge,
  PlayCircle,
  Image,
  Video,
  Music,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function AdminQueueMedia() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(5000);

  // Queries
  const mediaStats = trpc.queues.getMediaStats.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const mediaLimiterStatus = trpc.queues.getMediaLimiterStatus.useQuery(undefined, {
    refetchInterval: refreshInterval ?? false,
  });

  const mediaProviderConfigs = trpc.queues.getMediaProviderConfigs.useQuery();

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

  const isLoading = mediaStats.isLoading || mediaLimiterStatus.isLoading;
  const mediaModels = mediaStats.data?.models || [];
  const mediaLimiters = mediaLimiterStatus.data?.limiters || [];

  // Calculate totals
  const totalRequests = mediaModels.reduce((sum, m) => sum + m.requests, 0);
  const totalCompleted = mediaModels.reduce((sum, m) => sum + m.completed, 0);
  const totalFailed = mediaModels.reduce((sum, m) => sum + m.failed, 0);
  const totalCredits = mediaModels.reduce((sum, m) => sum + m.totalCreditsUsed, 0);

  // Calculate by type
  const imageModels = mediaModels.filter(m => m.mediaType === 'image');
  const videoModels = mediaModels.filter(m => m.mediaType === 'video');
  const audioModels = mediaModels.filter(m => m.mediaType === 'audio');

  const imageRequests = imageModels.reduce((sum, m) => sum + m.requests, 0);
  const videoRequests = videoModels.reduce((sum, m) => sum + m.requests, 0);
  const audioRequests = audioModels.reduce((sum, m) => sum + m.requests, 0);

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
                  <PlayCircle className="h-6 w-6 text-purple-500" />
                  Media Queue Monitor
                </h1>
                <p className="text-sm text-muted-foreground">
                  Image, video, and audio generation monitoring
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
                  mediaStats.refetch();
                  mediaLimiterStatus.refetch();
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Total Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRequests.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {totalCompleted.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {totalFailed.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Credits Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {totalCredits.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Providers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mediaLimiters.length}</div>
              <p className="text-xs text-muted-foreground">active limiters</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="limiters" className="gap-2">
              <Gauge className="h-4 w-4" />
              Rate Limiters
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <Activity className="h-4 w-4" />
              Models
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Zap className="h-4 w-4" />
              Config
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Media Type Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Image */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5 text-blue-500" />
                    Images
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-3xl font-bold">{imageRequests.toLocaleString()}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Completed: </span>
                        <span className="font-medium text-green-600">
                          {imageModels.reduce((sum, m) => sum + m.completed, 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed: </span>
                        <span className="font-medium text-red-600">
                          {imageModels.reduce((sum, m) => sum + m.failed, 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits: </span>
                        <span className="font-medium">
                          {imageModels.reduce((sum, m) => sum + m.totalCreditsUsed, 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Models: </span>
                        <span className="font-medium">{imageModels.length}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Video */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-purple-500" />
                    Videos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-3xl font-bold">{videoRequests.toLocaleString()}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Completed: </span>
                        <span className="font-medium text-green-600">
                          {videoModels.reduce((sum, m) => sum + m.completed, 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed: </span>
                        <span className="font-medium text-red-600">
                          {videoModels.reduce((sum, m) => sum + m.failed, 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits: </span>
                        <span className="font-medium">
                          {videoModels.reduce((sum, m) => sum + m.totalCreditsUsed, 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Models: </span>
                        <span className="font-medium">{videoModels.length}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Audio */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="h-5 w-5 text-green-500" />
                    Audio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-3xl font-bold">{audioRequests.toLocaleString()}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Completed: </span>
                        <span className="font-medium text-green-600">
                          {audioModels.reduce((sum, m) => sum + m.completed, 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed: </span>
                        <span className="font-medium text-red-600">
                          {audioModels.reduce((sum, m) => sum + m.failed, 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits: </span>
                        <span className="font-medium">
                          {audioModels.reduce((sum, m) => sum + m.totalCreditsUsed, 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Models: </span>
                        <span className="font-medium">{audioModels.length}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Provider Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Usage by Provider</CardTitle>
                <CardDescription>
                  Breakdown of requests across media providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mediaModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PlayCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No media usage data yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(
                      mediaModels.reduce((acc, m) => {
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
                      <div key={provider} className="p-4 border rounded-lg">
                        <div className="font-medium text-sm truncate">{provider}</div>
                        <div className="text-2xl font-bold">{stats.requests.toLocaleString()}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-green-600">{stats.completed} ok</span>
                          <span className="text-red-600">{stats.failed} fail</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {stats.credits.toLocaleString()} credits • {stats.models} models
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rate Limiters Tab */}
          <TabsContent value="limiters" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Media Provider Rate Limiters</CardTitle>
                <CardDescription>
                  Real-time status of rate limiting per media provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mediaLimiters.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active media rate limiters</p>
                    <p className="text-xs">Limiters are created on first request to each provider</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mediaLimiters.map((limiter) => {
                      const totalDone = limiter.done || 0;
                      const totalFailed = limiter.failed || 0;
                      const total = totalDone + totalFailed;
                      const successRate = total > 0 ? Math.round((totalDone / total) * 100) : 100;

                      return (
                        <div key={limiter.provider} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="font-semibold">{limiter.provider}</div>
                              <Badge variant={limiter.running > 0 ? "default" : "secondary"}>
                                {limiter.running} active
                              </Badge>
                              {limiter.queued > 0 && (
                                <Badge variant="outline" className="text-yellow-600">
                                  {limiter.queued} queued
                                </Badge>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                successRate >= 95 ? "text-green-600" :
                                successRate >= 80 ? "text-yellow-600" : "text-red-600"
                              )}
                            >
                              {successRate}% success
                            </Badge>
                          </div>

                          <div className="grid grid-cols-4 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Running:</span>{" "}
                              {limiter.running}
                            </div>
                            <div>
                              <span className="font-medium">Done:</span>{" "}
                              <span className="text-green-600">{limiter.done}</span>
                            </div>
                            <div>
                              <span className="font-medium">Failed:</span>{" "}
                              <span className="text-red-600">{limiter.failed}</span>
                            </div>
                            <div>
                              <span className="font-medium">Avg Wait:</span>{" "}
                              {limiter.avgWaitTime}ms
                            </div>
                          </div>

                          {limiter.lastRequestTime && (
                            <div className="text-xs text-muted-foreground mt-2">
                              Last request: {new Date(limiter.lastRequestTime).toLocaleString()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Media Models</CardTitle>
                <CardDescription>
                  Detailed usage statistics by model
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mediaStats.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : mediaModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PlayCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No media model usage data yet.</p>
                  </div>
                ) : (
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
                      {mediaModels
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
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  model.mediaType === 'image' && 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
                                  model.mediaType === 'video' && 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
                                  model.mediaType === 'audio' && 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Media Provider Rate Limit Configurations</CardTitle>
                <CardDescription>
                  Rate limiting settings per media provider with type multipliers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mediaProviderConfigs.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Max Concurrent</TableHead>
                        <TableHead className="text-right">Min Time (ms)</TableHead>
                        <TableHead className="text-right">Reservoir</TableHead>
                        <TableHead className="text-right">Refresh Interval</TableHead>
                        <TableHead className="text-right">Video Multiplier</TableHead>
                        <TableHead className="text-right">Audio Multiplier</TableHead>
                        <TableHead className="text-right">Timeout</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mediaProviderConfigs.data?.configs.map((config) => (
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
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-purple-600">
                              {config.videoMultiplier}x
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-green-600">
                              {config.audioMultiplier}x
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {config.timeout ? `${config.timeout / 1000}s` : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rate Limit Priority Explanation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Media generation uses priority-based scheduling to optimize API usage:
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Image className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Images</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Priority 2 - Fast generation, higher priority
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Music className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Audio</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Priority 3 - Medium speed, normal priority
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">Video</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Priority 5 - Slow generation, lower priority
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Video and audio multipliers increase the minimum time between requests
                  for those media types to prevent overloading providers with long-running tasks.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
