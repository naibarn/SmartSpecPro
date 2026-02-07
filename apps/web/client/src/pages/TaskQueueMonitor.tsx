/**
 * Task Queue Monitor
 *
 * Shows media generation tasks with status, retry info, and actions.
 * Admin: sees all users' tasks. User: sees only own tasks.
 * Auto-refreshes when active tasks exist.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Image,
  Video,
  Music,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
  Ban,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Download,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StatusFilter = "all" | "pending" | "processing" | "completed" | "failed" | "cancelled";
type MediaTypeFilter = "all" | "image" | "video" | "audio";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  processing: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  cancelled: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

const MEDIA_ICONS: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  audio: Music,
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function processingDuration(started: string | null, completed: string | null): string {
  if (!started) return "-";
  const start = new Date(started).getTime();
  const end = completed ? new Date(completed).getTime() : Date.now();
  const diff = end - start;
  if (diff < 1_000) return "<1s";
  if (diff < 60_000) return `${Math.round(diff / 1_000)}s`;
  return `${Math.floor(diff / 60_000)}m ${Math.round((diff % 60_000) / 1_000)}s`;
}

export default function TaskQueueMonitor() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Build query input
  const queryInput = useMemo(() => ({
    ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
    ...(mediaTypeFilter !== "all" ? { mediaType: mediaTypeFilter as any } : {}),
    limit: pageSize,
    offset: page * pageSize,
  }), [statusFilter, mediaTypeFilter, page]);

  // Admin sees all tasks, user sees own
  const adminQuery = trpc.media.listAllTasks.useQuery(queryInput, {
    enabled: isAdmin,
    refetchInterval: 10_000,
  });

  const userQuery = trpc.media.listTasks.useQuery(queryInput, {
    enabled: !isAdmin && !!user,
    refetchInterval: 10_000,
  });

  const activeQuery = isAdmin ? adminQuery : userQuery;
  const mediaTasks = (activeQuery.data as any)?.tasks || [];
  const mediaTotal = (activeQuery.data as any)?.total || 0;

  // Video editor / media-jobs (Redis-based)
  const mediaJobsQuery = trpc.mediaJobs.listJobs.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5_000,
  });

  // Map Redis job statuses → display statuses
  const REDIS_STATUS_MAP: Record<string, string> = {
    queued: "pending",
    processing: "processing",
    done: "completed",
    error: "failed",
    canceled: "cancelled",
  };

  const mediaJobRows = useMemo(() => {
    const raw = mediaJobsQuery.data || [];
    return raw.map((j: any) => ({
      id: j.jobId,
      _source: "mediaJob" as const,
      status: REDIS_STATUS_MAP[j.status] || j.status,
      media_type: "video",
      prompt: j.outputTarget
        ? `Video Export: ${j.outputTarget}`
        : `Video Export (${j.jobType || "render"})`,
      model: j.jobType || "-",
      user_id: null,
      created_at: j.submittedAt ? new Date(j.submittedAt).toISOString() : null,
      started_at: j.status === "processing" ? new Date(j.submittedAt).toISOString() : null,
      completed_at: j.status === "done" ? new Date().toISOString() : null,
      error_message: j.errorMessage || (j.status === "error" ? (j.message || "Job failed") : null),
      progress: j.progress || 0,
      result_url: j.resultUrl || null,
    }));
  }, [mediaJobsQuery.data]);

  // Merge both task sources, deduplicating renders that exist in both Redis and DB
  const tasks = useMemo(() => {
    const dbTasks = (mediaTasks as any[]).map((t: any) => ({ ...t, _source: "media" as const }));

    // Build a set of Redis mediaJob IDs for deduplication
    const mediaJobIds = new Set(mediaJobRows.map((r: any) => r.id));

    // During the 24h Redis/DB overlap period, a completed render appears in both sources.
    // Skip DB tasks that are video_editor renders if a matching Redis job still exists.
    const dedupedDbTasks = dbTasks.filter((t: any) => {
      if (t.parameters?.source === "video_editor" && mediaJobIds.has(t.id)) {
        return false;
      }
      return true;
    });

    // Apply status & type filters to mediaJob rows
    let filtered = mediaJobRows;
    if (statusFilter !== "all") {
      filtered = filtered.filter((t: any) => t.status === statusFilter);
    }
    if (mediaTypeFilter !== "all") {
      filtered = filtered.filter((t: any) => t.media_type === mediaTypeFilter);
    }
    return [...dedupedDbTasks, ...filtered].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [mediaTasks, mediaJobRows, statusFilter, mediaTypeFilter]);

  const total = mediaTotal + mediaJobRows.length;

  const cancelTask = trpc.media.cancelTask.useMutation({
    onSuccess: () => {
      toast.success("Task cancelled");
      activeQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMediaJob = trpc.mediaJobs.cancelJob.useMutation({
    onSuccess: () => {
      toast.success("Job cancelled");
      mediaJobsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteTask = trpc.media.deleteTask.useMutation({
    onSuccess: () => {
      toast.success("Task deleted");
      activeQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Stats (from both sources)
  const stats = useMemo(() => {
    const all = tasks as any[];
    return {
      total: all.length,
      active: all.filter((t: any) => t.status === "pending" || t.status === "processing").length,
      failed: all.filter((t: any) => t.status === "failed").length,
      completed: all.filter((t: any) => t.status === "completed").length,
    };
  }, [tasks]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Please log in to view your task queue.</p>
            <Link href="/login">
              <Button className="mt-4">Log In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card shrink-0">
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ListChecks className="h-6 w-6" />
              Task Queue
              {isAdmin && <Badge variant="outline" className="ml-2 text-xs">Admin</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "All users' media & video editor tasks" : "Your media & video editor tasks"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { activeQuery.refetch(); mediaJobsQuery.refetch(); }}
          disabled={activeQuery.isFetching || mediaJobsQuery.isFetching}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", (activeQuery.isFetching || mediaJobsQuery.isFetching) && "animate-spin")} />
          Refresh
        </Button>
      </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-6 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Tasks</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status:</span>
              <div className="flex gap-1">
                {(["all", "pending", "processing", "completed", "failed", "cancelled"] as StatusFilter[]).map((s) => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => { setStatusFilter(s); setPage(0); }}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Type:</span>
              <div className="flex gap-1">
                {(["all", "image", "video", "audio"] as MediaTypeFilter[]).map((t) => (
                  <Button
                    key={t}
                    variant={mediaTypeFilter === t ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => { setMediaTypeFilter(t); setPage(0); }}
                  >
                    {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            Tasks ({tasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(activeQuery.isLoading && mediaJobsQuery.isLoading) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListChecks className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No tasks found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Type</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="w-[120px]">Model</TableHead>
                      {isAdmin && <TableHead className="w-[100px]">User</TableHead>}
                      <TableHead className="w-[90px]">Created</TableHead>
                      <TableHead className="w-[90px]">Duration</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task: any) => {
                      const MediaIcon = MEDIA_ICONS[task.media_type] || Image;
                      return (
                        <TableRow key={task.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <MediaIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs capitalize">{task.media_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge
                                variant="outline"
                                className={cn("text-xs w-fit", STATUS_COLORS[task.status] || "")}
                              >
                                {task.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                                {task.status === "processing" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                {task.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                                {task.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                                {task.status === "cancelled" && <Ban className="h-3 w-3 mr-1" />}
                                {task.status}
                              </Badge>
                              {task._source === "mediaJob" && task.status === "processing" && task.progress > 0 && (
                                <span className="text-[10px] text-blue-400">{Math.round(task.progress * 100)}%</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className="text-sm truncate block max-w-[300px]"
                              title={task.prompt}
                            >
                              {task.prompt
                                ? task.prompt.length > 60
                                  ? task.prompt.slice(0, 60) + "..."
                                  : task.prompt
                                : "-"}
                            </span>
                            {task.error_message && (
                              <span
                                className="text-xs text-red-400 truncate block max-w-[300px]"
                                title={task.error_message}
                              >
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                {task.error_message.slice(0, 80)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {task.model || "-"}
                            </span>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {task.user_id ? `#${task.user_id}` : "-"}
                              </span>
                            </TableCell>
                          )}
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {relativeTime(task.created_at)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {processingDuration(task.started_at, task.completed_at)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {/* Download button for completed jobs with result URL */}
                              {task.status === "completed" && task.result_url && (
                                <a
                                  href={task.result_url}
                                  download
                                  title="Download result"
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-green-400 hover:text-green-300"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              )}
                              {(task.status === "pending" || task.status === "processing") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-yellow-400 hover:text-yellow-300"
                                  onClick={() => {
                                    if (task._source === "mediaJob") {
                                      cancelMediaJob.mutate({ jobId: task.id });
                                    } else {
                                      cancelTask.mutate({ taskId: task.id });
                                    }
                                  }}
                                  disabled={cancelTask.isPending || cancelMediaJob.isPending}
                                  title="Cancel task"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {task._source !== "mediaJob" && (task.status === "failed" || task.status === "cancelled" || task.status === "completed") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                                  onClick={() => deleteTask.mutate({ taskId: task.id })}
                                  disabled={deleteTask.isPending}
                                  title="Delete task"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages} ({total} tasks)
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
