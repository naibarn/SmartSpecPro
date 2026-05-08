import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, ExternalLink, Loader2, Mic2, Minus, Music2, Pencil, RefreshCw, RotateCcw, Trash2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { StoryboardCompanionAudioCandidate } from "@/lib/storyboardVideoProject";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";

export interface StoryboardReviewTask {
  id: string;
  index: number;
  prompt: string;
  url?: string | null;
  model?: string;
  durationSeconds?: number;
  generationModelId?: string;
  referenceUrls?: string[];
  generationAspectRatio?: string;
  generationExtraParams?: Record<string, unknown>;
  canRegenerate?: boolean;
  isImported?: boolean;
  status: "queued" | "generating" | "completed" | "error";
  error?: string;
}

interface StoryboardBatchReviewDialogProps {
  open: boolean;
  tasks: StoryboardReviewTask[];
  selectedTaskIds: string[];
  onOpenChange: (open: boolean) => void;
  onToggleTask: (taskId: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onRegenerateTask: (taskId: string, prompt: string) => void;
  onMoveTask?: (taskId: string, direction: "up" | "down") => void;
  onRemoveTask?: (taskId: string) => void;
  onAutoCompound: () => void;
  onCreateProject: () => void;
  isCompounding: boolean;
  isCreatingProject: boolean;
  regeneratingTaskId?: string | null;
  compoundStatus?: string | null;
  projectLink?: string | null;
  companionAudio?: StoryboardCompanionAudioCandidate[];
  regeneratingAudioId?: string | null;
  onRegenerateAudio?: (audioId: string) => void;
  onRemoveAudio?: (audioId: string) => void;
  muteVideoPreviewAudio?: boolean;
  renderDurationSeconds?: number | null;
}

export interface StoryboardBatchReviewPanelProps extends Omit<StoryboardBatchReviewDialogProps, "open"> {
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
  showCloseButton?: boolean;
}

function summarizePrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

export function StoryboardBatchReviewPanel({
  tasks,
  selectedTaskIds,
  onOpenChange,
  onToggleTask,
  onSelectAll,
  onSelectNone,
  onRegenerateTask,
  onMoveTask,
  onRemoveTask,
  onAutoCompound,
  onCreateProject,
  isCompounding,
  isCreatingProject,
  regeneratingTaskId,
  compoundStatus,
  projectLink,
  companionAudio = [],
  regeneratingAudioId,
  onRegenerateAudio,
  onRemoveAudio,
  muteVideoPreviewAudio = false,
  renderDurationSeconds,
  closeLabel = "Close",
  className,
  contentClassName,
  showCloseButton = true,
}: StoryboardBatchReviewPanelProps) {
  const { t } = useScopedTranslation(["media", "common"]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftPrompts, setDraftPrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraftPrompts((prev) => {
      const next: Record<string, string> = {};
      for (const task of tasks) {
        next[task.id] = prev[task.id] ?? task.prompt;
      }
      return next;
    });
  }, [tasks]);

  const selectedCount = selectedTaskIds.length;
  const completedSelectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIds.includes(task.id) && task.status === "completed" && task.url),
    [selectedTaskIds, tasks],
  );
  const renderDurationLabel = useMemo(() => {
    if (typeof renderDurationSeconds !== "number" || !Number.isFinite(renderDurationSeconds) || renderDurationSeconds <= 0) {
      return null;
    }
    const totalSeconds = Math.round(renderDurationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0
      ? t("mediaStudio.storyboardReviewDurationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") })
      : t("mediaStudio.storyboardReviewDurationSeconds", { seconds });
  }, [renderDurationSeconds]);
  const taskStatusLabel = (status: StoryboardReviewTask["status"]) => {
    switch (status) {
      case "completed":
        return t("mediaStudio.storyboardReviewStatusReady");
      case "generating":
        return t("mediaStudio.storyboardReviewStatusGenerating");
      case "queued":
        return t("mediaStudio.storyboardReviewStatusQueued");
      case "error":
        return t("mediaStudio.storyboardReviewStatusError");
      default:
        return status;
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-background", className)}>
        <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-3 text-left sm:px-6 sm:pt-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold leading-none sm:text-lg">
              <Video className="h-5 w-5 text-blue-500" />
              {t("mediaStudio.storyboardReview")}
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {t("mediaStudio.storyboardReviewPanelDescription")}
            </p>
          </div>
        </div>

        <div className="mx-3 flex shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("mediaStudio.storyboardReviewSelectedCount", { count: selectedCount })}</Badge>
            <span className="text-muted-foreground">
              {t("mediaStudio.storyboardReviewReadyForExport", { count: completedSelectedTasks.length })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" size="sm" onClick={onSelectAll}>
              {t("mediaStudio.storyboardReviewSelectAll")}
            </Button>
            <Button variant="outline" size="sm" onClick={onSelectNone}>
              {t("common.clear")}
            </Button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pr-2 sm:px-6 sm:pr-4", contentClassName)}>
          <div className="space-y-4">
            {companionAudio.length > 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-emerald-950">{t("mediaStudio.storyboardReviewSeparateAudioPreview")}</div>
                    <div className="text-xs text-emerald-800">
                      {t("mediaStudio.storyboardReviewSeparateAudioDesc")}
                    </div>
                  </div>
                  <Badge variant="secondary">{t("mediaStudio.storyboardReviewAudioTrackCount", { count: companionAudio.length })}</Badge>
                </div>

                <div className="space-y-2">
                  {companionAudio.map((audio) => {
                    const isVoiceover = audio.kind === "voiceover";
                    const durationLabel = audio.actualDurationSeconds && audio.targetDurationSeconds
                      ? t("mediaStudio.storyboardReviewAudioDurationTarget", {
                        actual: audio.actualDurationSeconds.toFixed(1),
                        target: audio.targetDurationSeconds.toFixed(1),
                      })
                      : audio.targetDurationSeconds
                        ? t("mediaStudio.storyboardReviewAudioTargetDuration", { target: audio.targetDurationSeconds.toFixed(1) })
                        : null;
                    const startTimeLabel = audio.startTimeSeconds && audio.startTimeSeconds > 0
                      ? t("mediaStudio.storyboardReviewAudioStarts", { start: audio.startTimeSeconds.toFixed(1) })
                      : null;
                    return (
                      <div key={audio.id} className="rounded-lg border bg-background p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700">
                              {isVoiceover ? <Mic2 className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{isVoiceover ? t("mediaStudio.storyboardReviewVoiceover") : t("mediaStudio.storyboardReviewMusic")}</Badge>
                                <span className="text-sm font-medium">{audio.title}</span>
                                {audio.model ? <Badge variant="secondary">{audio.model}</Badge> : null}
                                {audio.segmentCount && audio.segmentCount > 1 ? (
                                  <Badge variant="outline">
                                    {t("mediaStudio.storyboardReviewAudioPart", {
                                      index: (audio.segmentIndex ?? 0) + 1,
                                      count: audio.segmentCount,
                                    })}
                                  </Badge>
                                ) : null}
                                {durationLabel ? <Badge variant="outline">{durationLabel}</Badge> : null}
                                {startTimeLabel ? <Badge variant="outline">{startTimeLabel}</Badge> : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {summarizePrompt(audio.prompt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 lg:w-80">
                            <audio src={audio.url} controls className="w-full" />
                            <div className="flex flex-wrap gap-2">
                              {onRegenerateAudio ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={regeneratingAudioId === audio.id}
                                  onClick={() => onRegenerateAudio(audio.id)}
                                >
                                  {regeneratingAudioId === audio.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                  )}
                                  {t("mediaStudio.storyboardReviewRegenerateAudio")}
                                </Button>
                              ) : null}
                              {onRemoveAudio ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onRemoveAudio(audio.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("common.remove")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
            {tasks.map((task, taskIndex) => {
              const isSelected = selectedTaskIds.includes(task.id);
              const hasVideo = !!task.url && task.status === "completed";
              const isEditing = editingTaskId === task.id;
              const draftPrompt = draftPrompts[task.id] ?? task.prompt;
              const canRegenerate = task.canRegenerate !== false;
              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-xl border bg-background p-3 transition-colors",
                    isSelected ? "border-blue-300 ring-1 ring-blue-100" : "border-border",
                    !isSelected && "opacity-70",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleTask(task.id)}
                      className="mt-1"
                    />

                    <div className="w-full shrink-0 overflow-hidden rounded-lg border bg-muted/40 sm:w-36">
                      {hasVideo ? (
                        <video
                          src={task.url || undefined}
                          controls
                          muted={muteVideoPreviewAudio}
                          className="h-44 w-full object-cover sm:h-24"
                        />
                      ) : (
                        <div className="flex h-44 items-center justify-center text-muted-foreground sm:h-24">
                          {task.status === "generating" ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : task.status === "error" ? (
                            <AlertCircle className="h-6 w-6 text-destructive" />
                          ) : (
                            <Video className="h-6 w-6" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 })}</Badge>
                        <Badge
                          variant={task.status === "completed" ? "default" : task.status === "error" ? "destructive" : "secondary"}
                        >
                          {taskStatusLabel(task.status)}
                        </Badge>
                        {task.model ? <Badge variant="secondary">{task.model}</Badge> : null}
                        {task.isImported ? <Badge variant="outline">{t("mediaStudio.storyboardReviewImported")}</Badge> : null}
                      </div>

                      <p className="mt-2 text-sm font-medium leading-6">
                        {isEditing ? t("mediaStudio.storyboardReviewEditPromptLead") : summarizePrompt(task.prompt)}
                      </p>

                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={draftPrompt}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftPrompts((prev) => ({ ...prev, [task.id]: value }));
                            }}
                            className="min-h-[140px]"
                            placeholder={t("mediaStudio.storyboardReviewEditPromptPlaceholder")}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingTaskId(null)}
                            >
                              <X className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewDoneEditing")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDraftPrompts((prev) => ({ ...prev, [task.id]: task.prompt }))}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {t("common.reset")}
                            </Button>
                          </div>
                        </div>
                      ) : task.error ? (
                        <p className="mt-1 text-xs text-destructive">{task.error}</p>
                      ) : null}

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (isEditing) {
                              setEditingTaskId(null);
                              return;
                            }
                            setEditingTaskId(task.id);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {isEditing ? "Stop editing" : "Edit"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canRegenerate || regeneratingTaskId === task.id}
                          onClick={() => onRegenerateTask(task.id, draftPrompt)}
                          title={canRegenerate ? t("mediaStudio.storyboardReviewRegenerateTitle") : t("mediaStudio.storyboardReviewImportedNoRegenerate")}
                        >
                          {regeneratingTaskId === task.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          {t("mediaStudio.storyboardReviewRegenerate")}
                        </Button>
                        {onMoveTask ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={taskIndex === 0}
                              onClick={() => onMoveTask(task.id, "up")}
                            >
                              <ArrowUp className="mr-2 h-4 w-4" />
                              {t("common.up")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={taskIndex === tasks.length - 1}
                              onClick={() => onMoveTask(task.id, "down")}
                            >
                              <ArrowDown className="mr-2 h-4 w-4" />
                              {t("common.down")}
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "secondary" : "ghost"}
                          onClick={() => onToggleTask(task.id)}
                        >
                          {isSelected ? (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewKeep")}
                            </>
                          ) : (
                            <>
                              <Minus className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewExclude")}
                            </>
                          )}
                        </Button>
                        {onRemoveTask ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onRemoveTask(task.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("common.remove")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t bg-background px-3 pb-3 pt-3 sm:px-6 sm:pb-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{t("mediaStudio.storyboardReviewRenderEstimate")}</span>
              <span className="text-sky-800">
              {renderDurationLabel
                ? t("mediaStudio.storyboardReviewRenderEstimateReady", {
                  duration: renderDurationLabel,
                  count: completedSelectedTasks.length,
                })
                : t("mediaStudio.storyboardReviewRenderEstimateEmpty")}
              </span>
            </div>
          </div>

          {compoundStatus ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {compoundStatus}
            </div>
          ) : null}

          {projectLink ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("mediaStudio.storyboardReviewProjectCreated")}</div>
                  <a className="block break-all underline decoration-emerald-400 underline-offset-2" href={projectLink}>
                    {t("mediaStudio.storyboardReviewOpenProjectInEditor")}
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <a href={projectLink}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("mediaStudio.storyboardReviewOpenProject")}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50">
                    <a href={projectLink} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("mediaStudio.storyboardReviewOpenNewTab")}
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="default"
                onClick={onAutoCompound}
                disabled={isCompounding || completedSelectedTasks.length === 0}
              >
                {isCompounding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("mediaStudio.storyboardReviewRenderVideoAudio")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCreateProject}
                disabled={isCreatingProject || completedSelectedTasks.length === 0}
              >
                {isCreatingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("mediaStudio.storyboardReviewCreateVideoEditProject")}
              </Button>
            </div>
            {showCloseButton ? (
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                {closeLabel}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
    </div>
  );
}

export function StoryboardBatchReviewDialog({
  open,
  ...props
}: StoryboardBatchReviewDialogProps) {
  const { t } = useScopedTranslation(["media", "common"]);

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="!flex !max-w-[min(92vw,72rem)] !p-0 max-h-[calc(100dvh-2rem)] min-h-0 w-[min(92vw,72rem)] flex-col overflow-hidden">
        <DialogTitle className="sr-only">{t("mediaStudio.storyboardReview")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("mediaStudio.storyboardReviewDialogDescription")}
        </DialogDescription>
        <StoryboardBatchReviewPanel {...props} />
      </DialogContent>
    </Dialog>
  );
}
