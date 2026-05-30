import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Image,
  Loader2,
  Music,
  RefreshCw,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

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
  headerAction?: React.ReactNode;
  onTaskClick?: (task: GenerationTask) => void;
  onTaskRetry?: (task: GenerationTask) => void;
  onTaskRemove?: (taskId: string) => void;
  onClearCompleted?: () => void;
  onClose?: () => void;
  focusTaskId?: string | null;
  maxVisible?: number;
  title?: string;
  subtitle?: string;
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

interface FloatingPanelPosition {
  x: number;
  y: number;
}

interface FloatingPanelDragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const FLOATING_PANEL_VIEWPORT_MARGIN = 12;

function clampFloatingPanelPosition(
  position: FloatingPanelPosition,
  width: number,
  height: number,
): FloatingPanelPosition {
  const maxX = Math.max(
    FLOATING_PANEL_VIEWPORT_MARGIN,
    window.innerWidth - width - FLOATING_PANEL_VIEWPORT_MARGIN,
  );
  const maxY = Math.max(
    FLOATING_PANEL_VIEWPORT_MARGIN,
    window.innerHeight - height - FLOATING_PANEL_VIEWPORT_MARGIN,
  );

  return {
    x: Math.min(Math.max(position.x, FLOATING_PANEL_VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, FLOATING_PANEL_VIEWPORT_MARGIN), maxY),
  };
}

export function GenerationProgress({
  tasks,
  headerAction,
  onTaskClick,
  onTaskRetry,
  onTaskRemove,
  onClearCompleted,
  onClose,
  focusTaskId,
  maxVisible = 5,
  title,
  subtitle,
  className = "",
  expanded: controlledExpanded,
  onExpandedChange,
}: GenerationProgressProps) {
  const { t } = useScopedTranslation("media");
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [idleDetailsOpen, setIdleDetailsOpen] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = onExpandedChange ?? setInternalExpanded;
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<FloatingPanelDragState | null>(null);
  const [panelPosition, setPanelPosition] = useState<FloatingPanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const headerTitle = title ?? t("generationQueueTitle");
  const headerSubtitle = subtitle ?? t("generationQueueSubtitle");

  const queuedCount = tasks.filter((t) => t.status === "queued").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const processingCount = tasks.filter((t) => t.status === "processing").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const cancelledCount = tasks.filter((t) => t.status === "cancelled").length;
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
      label: t("image"),
    },
    video: {
      badge: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-900",
      icon: <Video className="h-3.5 w-3.5" />,
      label: t("video"),
    },
    audio: {
      badge: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-900",
      icon: <Music className="h-3.5 w-3.5" />,
      label: t("audio"),
    },
    document: {
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-900",
      icon: <FileText className="h-3.5 w-3.5" />,
      label: t("document"),
    },
  }), [t]);

  useEffect(() => {
    if (activeCount === 0) {
      setIdleDetailsOpen(false);
    }
  }, [activeCount]);

  useEffect(() => {
    if (!focusTaskId) return;
    const node = taskRefs.current[focusTaskId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusTaskId, tasks.length, showTaskList, listExpanded]);

  const reclampPanelPosition = useCallback(() => {
    setPanelPosition((currentPosition) => {
      if (!currentPosition) {
        return currentPosition;
      }

      const panel = panelRef.current;
      if (!panel) {
        return currentPosition;
      }

      const rect = panel.getBoundingClientRect();
      const nextPosition = clampFloatingPanelPosition(currentPosition, rect.width, rect.height);
      if (nextPosition.x === currentPosition.x && nextPosition.y === currentPosition.y) {
        return currentPosition;
      }
      return nextPosition;
    });
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const nextPosition = clampFloatingPanelPosition(
        {
          x: dragState.originX + (event.clientX - dragState.startX),
          y: dragState.originY + (event.clientY - dragState.startY),
        },
        dragState.width,
        dragState.height,
      );
      setPanelPosition((currentPosition) => {
        if (
          currentPosition &&
          currentPosition.x === nextPosition.x &&
          currentPosition.y === nextPosition.y
        ) {
          return currentPosition;
        }
        return nextPosition;
      });
    };

    const stopDragging = (pointerId?: number) => {
      const dragState = dragStateRef.current;
      if (dragState && pointerId !== undefined && dragState.pointerId !== pointerId) {
        return;
      }
      dragStateRef.current = null;
      setIsDragging(false);
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const handlePointerEnd = (event: PointerEvent) => {
      stopDragging(event.pointerId);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!panelPosition) {
      return;
    }

    const handleResize = () => {
      reclampPanelPosition();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [panelPosition, reclampPanelPosition]);

  useEffect(() => {
    reclampPanelPosition();
  }, [tasks.length, listExpanded, showTaskList, isMinimized, reclampPanelPosition]);

  const handleDragStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      const initialPosition = clampFloatingPanelPosition(
        { x: rect.left, y: rect.top },
        rect.width,
        rect.height,
      );

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: initialPosition.x,
        originY: initialPosition.y,
        width: rect.width,
        height: rect.height,
      };
      setPanelPosition(initialPosition);
      setIsDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    },
    [],
  );

  const statusStyles = useMemo(() => ({
    queued: {
      badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
      icon: <RefreshCw className="h-3 w-3" />,
      label: t("queued"),
    },
    pending: {
      badge: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: t("pending"),
    },
    processing: {
      badge: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-900",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: t("processing"),
    },
    completed: {
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-900",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: t("completed"),
    },
    failed: {
      badge: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-900",
      icon: <AlertCircle className="h-3 w-3" />,
      label: t("failed"),
    },
    cancelled: {
      badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
      icon: <XCircle className="h-3 w-3" />,
      label: t("cancelled"),
    },
  }), [t]);

  if (tasks.length === 0) {
    return null;
  }

  const panelPlacementClassName = panelPosition ? "" : "bottom-4 right-4";
  const panelStyle = panelPosition
    ? {
        left: panelPosition.x,
        top: panelPosition.y,
      }
    : undefined;
  const panelWidthClassName = isMinimized
    ? "w-[min(18rem,calc(100vw-1rem))]"
    : "w-[min(24rem,calc(100vw-1rem))]";

  return (
    <div
      ref={panelRef}
      data-testid="generation-progress-panel"
      className={`pointer-events-none fixed z-[60] ${panelWidthClassName} ${panelPlacementClassName} ${
        isDragging ? "select-none" : ""
      } ${className}`}
      style={panelStyle}
    >
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/95">
        {isMinimized ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              aria-label={t("dragToMove")}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-400 transition hover:border-sky-200 hover:text-sky-600 dark:border-slate-700/80 dark:bg-slate-950/80 dark:text-slate-500 dark:hover:border-sky-800 dark:hover:text-sky-300 ${
                isDragging
                  ? "cursor-grabbing border-sky-300 text-sky-600 dark:border-sky-700 dark:text-sky-300"
                  : "cursor-grab"
              }`}
              data-testid="generation-progress-drag-handle"
              onClick={(event) => event.preventDefault()}
              onPointerDown={handleDragStart}
              title={t("dragToMove")}
              type="button"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setIsMinimized(false)}
              aria-label={t("generationQueue.expandQueue")}
              data-testid="generation-progress-minimized-button"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {headerTitle}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {t("items", { count: tasks.length })}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {processingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    {t("generationQueue.processingCount", { count: processingCount })}
                  </span>
                ) : activeCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {t("generationQueue.activeCount", { count: activeCount })}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {t("generationQueue.idle")}
                  </span>
                )}
              </div>
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                aria-label={t("generationQueue.closeQueue")}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsMinimized(false)}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={t("generationQueue.expandQueue")}
              type="button"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        ) : (
        <>
        <div className="border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <button
                aria-label={t("dragToMove")}
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-400 transition hover:border-sky-200 hover:text-sky-600 dark:border-slate-700/80 dark:bg-slate-950/80 dark:text-slate-500 dark:hover:border-sky-800 dark:hover:text-sky-300 ${
                  isDragging
                    ? "cursor-grabbing border-sky-300 text-sky-600 dark:border-sky-700 dark:text-sky-300"
                    : "cursor-grab"
                }`}
                data-testid="generation-progress-drag-handle"
                onClick={(event) => event.preventDefault()}
                onPointerDown={handleDragStart}
                title={t("dragToMove")}
                type="button"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {headerTitle}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {t("items", { count: tasks.length })}
                  </span>
                  {activeCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                      {t("generationQueue.activeCount", { count: activeCount })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 self-start">
              {headerAction ? (
                <div className="mr-1">{headerAction}</div>
              ) : null}
              {completedCount > 0 && onClearCompleted && (
                <button
                  onClick={onClearCompleted}
                  className="whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/60"
                  type="button"
                >
                  {t("generationQueue.clearDone")}
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="rounded-full p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                  aria-label={t("generationQueue.closeQueue")}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(true)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={t("generationQueue.collapseQueue")}
                type="button"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {imageCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.image.badge}`}>
                {typeStyles.image.icon}
                {t("generationQueue.imageCount", { count: imageCount })}
              </span>
            )}
            {videoCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.video.badge}`}>
                {typeStyles.video.icon}
                {t("generationQueue.videoCount", { count: videoCount })}
              </span>
            )}
            {audioCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.audio.badge}`}>
                {typeStyles.audio.icon}
                {t("generationQueue.audioCount", { count: audioCount })}
              </span>
            )}
            {documentCount > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${typeStyles.document.badge}`}>
                {typeStyles.document.icon}
                {t("generationQueue.documentCount", { count: documentCount })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 px-4 py-2 text-xs dark:border-slate-700/80">
          {queuedCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span>{t("generationQueue.queuedCount", { count: queuedCount })}</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>{t("generationQueue.pendingCount", { count: pendingCount })}</span>
            </div>
          )}
          {processingCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span>{t("generationQueue.processingCount", { count: processingCount })}</span>
            </div>
          )}
          {completedCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>{t("generationQueue.completedCount", { count: completedCount })}</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span>{t("generationQueue.failedCount", { count: failedCount })}</span>
            </div>
          )}
          {cancelledCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span>{t("generationQueue.cancelledCount", { count: cancelledCount })}</span>
            </div>
          )}
          {isIdle && (
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t("generationQueue.idle")}
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
                {t("generationQueue.showMore", { count: tasks.length - maxVisible })}
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {t("generationQueue.noActiveJobs")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("generationQueue.completedTasksAvailableInDetails")}
                </p>
              </div>
              <button
                onClick={() => setIdleDetailsOpen(true)}
                className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                type="button"
              >
                {t("generationQueue.showDetails")}
              </button>
            </div>
          </div>
        )}
        </>
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
  typeStyles: Record<GenerationTask["type"], { badge: string; icon: React.ReactNode; label: string }>;
  statusStyles: Record<GenerationTask["status"], { badge: string; icon: React.ReactNode; label: string }>;
}

const TaskItem = React.forwardRef<HTMLDivElement, TaskItemProps>(function TaskItem(
  { task, onClick, onRetry, onRemove, isFocused, typeStyles, statusStyles }: TaskItemProps,
  ref,
) {
  const { t } = useScopedTranslation("media");
  const [showDetails, setShowDetails] = useState(false);
  const canRemove = Boolean(
    onRemove && (task.status === "completed" || task.status === "failed" || task.status === "cancelled"),
  );
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
              {typeStyles[task.type].label}
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
            {formatTaskTime(task.updatedAt, t)}
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
                {t("generationQueue.retry")}
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
              {showDetails ? t("generationQueue.hideDetails") : t("generationQueue.showDetails")}
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
                {t("generationQueue.openResult")}
              </button>
            )}
          </div>

          {showDetails && (
            <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-500 dark:text-slate-400">{t("generationQueue.taskId")}</span>
                <span className="break-all font-mono">{task.backendTaskId || task.providerTaskId || task.id}</span>
              </div>
              {task.backendTaskId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{t("generationQueue.backendId")}</span>
                  <span className="break-all font-mono">{task.backendTaskId}</span>
                </div>
              )}
              {task.providerTaskId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{t("generationQueue.providerId")}</span>
                  <span className="break-all font-mono">{task.providerTaskId}</span>
                </div>
              )}
              {task.statusDetail && (
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{t("generationQueue.detail")}</span>
                  <span className="text-right">{task.statusDetail}</span>
                </div>
              )}
              {task.model && (
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{t("generationQueue.model")}</span>
                  <span className="text-right break-all font-mono">{task.model}</span>
                </div>
              )}
              {task.error && (
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{t("generationQueue.error")}</span>
                  <span className="text-right text-rose-600 dark:text-rose-300">{task.error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {canRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={t("generationQueue.removeTask")}
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

function formatTaskTime(
  value: Date | number | string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return t("generationQueue.justNow");

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return t("generationQueue.justNow");
  if (minutes < 60) return t("generationQueue.minutesAgo", { count: minutes });
  if (hours < 24) return t("generationQueue.hoursAgo", { count: hours });
  return t("generationQueue.daysAgo", { count: days });
}
