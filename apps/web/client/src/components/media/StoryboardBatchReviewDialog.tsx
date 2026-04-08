import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, Minus, Pencil, RefreshCw, RotateCcw, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface StoryboardReviewTask {
  id: string;
  index: number;
  prompt: string;
  url?: string | null;
  model?: string;
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
  onAutoCompound: () => void;
  onCreateProject: () => void;
  isCompounding: boolean;
  isCreatingProject: boolean;
  regeneratingTaskId?: string | null;
  compoundStatus?: string | null;
  projectLink?: string | null;
}

function summarizePrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

export function StoryboardBatchReviewDialog({
  open,
  tasks,
  selectedTaskIds,
  onOpenChange,
  onToggleTask,
  onSelectAll,
  onSelectNone,
  onRegenerateTask,
  onAutoCompound,
  onCreateProject,
  isCompounding,
  isCreatingProject,
  regeneratingTaskId,
  compoundStatus,
  projectLink,
}: StoryboardBatchReviewDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-blue-500" />
            Storyboard Review
          </DialogTitle>
          <DialogDescription>
            Review all generated clips from this storyboard, remove any clips you do not want,
            rerun a single prompt if needed, then either compound the selected clips or send the
            batch into the video editor as a project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedCount} selected</Badge>
            <span className="text-muted-foreground">
              {completedSelectedTasks.length} ready for export
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSelectAll}>
              Select all
            </Button>
            <Button variant="outline" size="sm" onClick={onSelectNone}>
              Clear
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[48vh] pr-3">
          <div className="space-y-3">
            {tasks.map((task) => {
              const isSelected = selectedTaskIds.includes(task.id);
              const hasVideo = !!task.url && task.status === "completed";
              const isEditing = editingTaskId === task.id;
              const draftPrompt = draftPrompts[task.id] ?? task.prompt;
              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-xl border bg-background p-3 transition-colors",
                    isSelected ? "border-blue-300 ring-1 ring-blue-100" : "border-border",
                    !isSelected && "opacity-70",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleTask(task.id)}
                      className="mt-1"
                    />

                    <div className="w-36 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                      {hasVideo ? (
                        <video
                          src={task.url || undefined}
                          controls
                          className="h-24 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center text-muted-foreground">
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
                        <Badge variant="outline">Clip {task.index + 1}</Badge>
                        <Badge
                          variant={task.status === "completed" ? "default" : task.status === "error" ? "destructive" : "secondary"}
                        >
                          {task.status === "completed" ? "Ready" : task.status === "generating" ? "Generating" : task.status}
                        </Badge>
                        {task.model ? <Badge variant="secondary">{task.model}</Badge> : null}
                      </div>

                      <p className="mt-2 text-sm font-medium leading-6">
                        {isEditing ? "Edit this prompt before regenerating:" : summarizePrompt(task.prompt)}
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
                            placeholder="Edit the prompt for this clip..."
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingTaskId(null)}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Done editing
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDraftPrompts((prev) => ({ ...prev, [task.id]: task.prompt }))}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reset
                            </Button>
                          </div>
                        </div>
                      ) : task.error ? (
                        <p className="mt-1 text-xs text-destructive">{task.error}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
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
                          disabled={regeneratingTaskId === task.id}
                          onClick={() => onRegenerateTask(task.id, draftPrompt)}
                        >
                          {regeneratingTaskId === task.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Regenerate
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "secondary" : "ghost"}
                          onClick={() => onToggleTask(task.id)}
                        >
                          {isSelected ? (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              Keep in final cut
                            </>
                          ) : (
                            <>
                              <Minus className="mr-2 h-4 w-4" />
                              Exclude
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
          Shared continuity notes stay attached when the selected clips are compounded or sent to the editor.
        </div>

        {compoundStatus ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            {compoundStatus}
          </div>
        ) : null}

        {projectLink ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">Project created</div>
                <a className="mt-1 block break-all underline decoration-emerald-400 underline-offset-2" href={projectLink}>
                  Open project in the editor
                </a>
                <p className="mt-1 text-xs text-emerald-800">
                  Continue editing this storyboard as a Video Editor project.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <a href={projectLink}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open project
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50">
                  <a href={projectLink} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in new tab
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              onClick={onAutoCompound}
              disabled={isCompounding || completedSelectedTasks.length === 0}
            >
              {isCompounding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Auto compound selected clips
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCreateProject}
              disabled={isCreatingProject || completedSelectedTasks.length === 0}
            >
              {isCreatingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create video edit project
            </Button>
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
