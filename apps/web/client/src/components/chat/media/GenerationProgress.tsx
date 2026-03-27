import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Image,
  Loader2,
  Music,
  RefreshCw,
  Video,
  X,
  XCircle,
} from "lucide-react";

export interface GenerationTask {
  id: string;
  type: "image" | "video" | "audio" | "document";
  prompt: string;
  model?: string;
  status: "queued" | "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress?: number;
  result?: string;
  error?: string;
  createdAt: Date | number | string;
  updatedAt: Date | number | string;
  backendTaskId?: string;
  providerTaskId?: string;
  statusDetail?: string;
}

export function useGenerationTasks() {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);

  const addTask = (task: Omit<GenerationTask, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date();
    const newTask: GenerationTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      createdAt: now,
      updatedAt: now,
    };
    setTasks((prev) => [newTask, ...prev]);
    return newTask.id;
  };

  const updateTask = (id: string, updates: Partial<GenerationTask>) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, ...updates, updatedAt: new Date() }
          : task
      )
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) => prev.filter((task) => task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled"));
  };

  const clearAll = () => {
    setTasks([]);
  };

  return {
    tasks,
    addTask,
    updateTask,
    removeTask,
    clearCompleted,
    clearAll,
  };
}

interface GenerationProgressProps {
  tasks: GenerationTask[];
  onTaskClick?: (task: GenerationTask) => void;
  onTaskRetry?: (task: GenerationTask) => void;
  onTaskRemove?: (taskId: string) => void;
  onClearCompleted?: () => void;
  focusTaskId?: string | null;
  maxVisible?: number;
  title?: string;
  subtitle?: string;
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function GenerationProgress({
  tasks,
  onTaskClick,
  onTaskRetry,
  onTaskRemove,
  onClearCompleted,
  focusTaskId,
  maxVisible = 5,
  title = "Generation Queue",
  subtitle = "You can keep editing while the queue runs in the background.",
  className = "",
  expanded: controlledExpanded,
  onExpandedChange,
}: GenerationProgressProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [idleDetailsOpen, setIdleDetailsOpen] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = onExpandedChange ?? setInternalExpanded;
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const queuedCount = tasks.filter((t) => t.status === "queued").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const processingCount = tasks.filter((t) => t.status === "processing").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed" || t.status === "cancelled").length;
  const imageCount = tasks.filter((t) => t.type === "image").length;
  const videoCount = tasks.filter((t) => t.type === "video").length;
  const audioCount = tasks.filter((t) => t.type === "audio").length;
  const documentCount = tasks.filter((t) => t.type === "document").length;
  const activeCount = queuedCount + pendingCount + processingCount;
  const isIdle = activeCount === 0;
  const listExpanded = isIdle ? idleDetailsOpen : expanded;
  const showTaskList = !isIdle || idleDetailsOpen;
  const visibleTasks = showTaskList
    ? (listExpanded ? tasks : tasks.slice(0, maxVisible))
    : [];
  const hasMore = showTaskList && tasks.length > maxVisible && !listExpanded;

  const typeStyles = useMemo(() => ({
    image: {
      badge: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-900",
      icon: <Image className="h-3.5 w-3.5" />,
    },
    video: {
      badge: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-900",
      icon: <Video className="h-3.5 w-3.5" />,
    },
    audio: {
      badge: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-900",
      icon: <Music className="h-3.5 w-3.5" />,
    },
    document: {
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-900",
      icon: <FileText className="h-3.5 w-3.5" />,
    },
  }), []);

  React.useEffect(() => {
    if (activeCount === 0) {
      setIdleDetailsOpen(false);
    }
  }, [activeCount]);

  React.useEffect(() => {
    if (!focusTaskId) return;
    const node = taskRefs.current[focusTaskId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusTaskId, tasks.length, showTaskList, listExpanded]);

  const statusStyles = useMemo(() => ({
    queued: {
      badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
      icon: <RefreshCw className="h-3 w-3" />,
      label: "Queued",
    },
    pending: {
      badge: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Pending",
    },
    processing: {
      badge: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-900",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Processing",
    },
    completed: {
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-900",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Completed",
    },
    failed: {
      badge: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-900",
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Failed",
    },
    cancelled: {
      badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
      icon: <XCircle className="h-3 w-3" />,
      label: "Cancelled",
    },
  }), []);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className={`pointer-events-none fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-1rem))] ${className}`}>
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/95">
        <div className="border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {title}
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {tasks.length} items
                </span>
                {activeCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                    {activeCount} active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {completedCount > 0 && onClearCompleted && (
                <button
                  onClick={onClearCompleted}
                  className="rounded-full px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/60"
                >
                  Clear done
                </button>
              )}
              <button
                onClick={() => {
                  if (isIdle) {
                    setIdleDetailsOpen((prev) => !prev);
                    return;
                  }
                  setExpanded(!expanded);
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={
                  isIdle
                    ? (idleDetailsOpen ? "Hide details" : "Show details")
                    : (expanded ? "Collapse queue" : "Expand queue")
                }
                type="button"
              >
                {isIdle
                  ? (idleDetailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />)
                  : (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />)}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {imageCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.image.badge}`}>
                {typeStyles.image.icon}
                {imageCount} images
              </span>
            )}
            {videoCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.video.badge}`}>
                {typeStyles.video.icon}
                {videoCount} videos
              </span>
            )}
            {audioCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.audio.badge}`}>
                {typeStyles.audio.icon}
                {audioCount} audio
              </span>
            )}
            {documentCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.document.badge}`}>
                {typeStyles.document.icon}
                {documentCount} docs
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 px-4 py-2 text-xs dark:border-slate-700/80">
          {queuedCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span>{queuedCount} queued</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>{pendingCount} pending</span>
            </div>
          )}
          {processingCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span>{processingCount} processing</span>
            </div>
          )}
          {completedCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>{completedCount} done</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span>{failedCount} failed</span>
            </div>
          )}
          {isIdle && (
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Idle
            </span>
          )}
        </div>

        {showTaskList ? (
          <div className="max-h-[28rem] overflow-y-auto">
            {visibleTasks.map((task) => {
              const taskKey = task.backendTaskId || task.providerTaskId || task.id;
              const isFocused = focusTaskId === taskKey;
              return (
              <TaskItem
                key={taskKey}
                task={task}
                ref={(node) => {
                  taskRefs.current[taskKey] = node;
                }}
                onClick={() => onTaskClick?.(task)}
                onRetry={onTaskRetry ? () => onTaskRetry(task) : undefined}
                onRemove={onTaskRemove ? () => onTaskRemove(task.id) : undefined}
                typeStyles={typeStyles}
                statusStyles={statusStyles}
                isFocused={isFocused}
              />
            );
            })}

            {hasMore && !listExpanded && (
              <button
                onClick={() => {
                  if (isIdle) {
                    setIdleDetailsOpen(true);
                    return;
                  }
                  setExpanded(true);
                }}
                className="w-full border-t border-slate-200/80 bg-slate-50 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
                type="button"
              >
                Show {tasks.length - maxVisible} more
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  No active jobs
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Completed tasks are still available in details.
                </p>
              </div>
              <button
                onClick={() => setIdleDetailsOpen(true)}
                className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                type="button"
              >
                Show details
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: GenerationTask;
  onClick?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  isFocused?: boolean;
  typeStyles: Record<GenerationTask["type"], { badge: string; icon: React.ReactNode }>;
  statusStyles: Record<GenerationTask["status"], { badge: string; icon: React.ReactNode; label: string }>;
}

const TaskItem = React.forwardRef<HTMLDivElement, TaskItemProps>(function TaskItem(
  { task, onClick, onRetry, onRemove, isFocused, typeStyles, statusStyles }: TaskItemProps,
  ref,
) {
  const [showDetails, setShowDetails] = useState(false);
  const progress = task.progress ?? (
    task.status === "completed"
      ? 100
      : task.status === "processing"
        ? 60
        : task.status === "pending"
          ? 25
          : task.status === "queued"
            ? 10
            : 0
  );

  return (
    <div
      ref={ref}
      className={`cursor-pointer border-b border-slate-200/80 p-4 hover:bg-slate-50/80 dark:border-slate-700/80 dark:hover:bg-slate-900/70 ${
        isFocused ? "bg-sky-50/70 ring-1 ring-inset ring-sky-400/70 dark:bg-sky-950/35 dark:ring-sky-500/50" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${typeStyles[task.type].badge}`}>
              {typeStyles[task.type].icon}
            </span>
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {task.type}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyles[task.status].badge}`}>
              {statusStyles[task.status].icon}
              <span>{statusStyles[task.status].label}</span>
            </span>
          </div>

          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {task.prompt}
          </p>

          {task.statusDetail && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {task.statusDetail}
            </p>
          )}

          {(task.status === "processing" || task.status === "pending" || task.status === "queued") && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {task.status === "failed" && task.error && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">
              {task.error}
            </p>
          )}

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {formatTime(task.updatedAt)}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {task.status === "failed" && onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="rounded-full border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/60"
                type="button"
              >
                Retry
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails((prev) => !prev);
              }}
              className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              type="button"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
            {task.result && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClick?.();
                }}
                className="rounded-full border border-sky-200 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-300 dark:hover:bg-sky-950/60"
                type="button"
              >
                Open result
              </button>
            )}
          </div>

          {showDetails && (
            <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-500 dark:text-slate-400">Task ID</span>
                <span className="break-all font-mono">{task.backendTaskId || task.providerTaskId || task.id}</span>
              </div>
              {task.backendTaskId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Backend ID</span>
                  <span className="break-all font-mono">{task.backendTaskId}</span>
                </div>
              )}
              {task.providerTaskId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Provider ID</span>
                  <span className="break-all font-mono">{task.providerTaskId}</span>
                </div>
              )}
              {task.statusDetail && (
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Detail</span>
                  <span className="text-right">{task.statusDetail}</span>
                </div>
              )}
              {task.model && (
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Model</span>
                  <span className="text-right break-all font-mono">{task.model}</span>
                </div>
              )}
              {task.error && (
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Error</span>
                  <span className="text-right text-rose-600 dark:text-rose-300">{task.error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Remove task"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});
TaskItem.displayName = "TaskItem";

function formatTime(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
