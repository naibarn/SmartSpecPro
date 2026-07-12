/**
 * Shared card for a Phase-1 "job is queued/wired, but the LLM step is
 * intentionally not fabricated yet" action (Feature 133, section-08) —
 * used by `runScenePlanStage`, `runQualityReview`, `applyQualityRepairs`.
 * Never hides the action button; always shows a clear, specific notice
 * when the job comes back `failed` with a `VI_*_NOT_WIRED` error.
 */
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

interface JobStatusLike {
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  progress: { stage: string; message?: string } | null;
}

export function NotWiredJobCard({
  lang,
  title,
  buttonLabel,
  icon,
  testId,
  jobStatus,
  disabled,
  onRun,
}: {
  lang: VideoStudioLang;
  title: string;
  buttonLabel: string;
  icon?: React.ReactNode;
  testId: string;
  jobStatus?: JobStatusLike | null;
  disabled?: boolean;
  onRun: () => void;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          className="self-start gap-2"
          data-testid={testId}
          disabled={disabled || jobStatus?.status === "running" || jobStatus?.status === "queued"}
          onClick={onRun}
        >
          {jobStatus?.status === "running" || jobStatus?.status === "queued" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            icon
          )}
          {buttonLabel}
        </Button>

        {jobStatus?.status === "failed" ? (
          <div
            role="status"
            data-testid={`${testId}-not-wired-notice`}
            className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">{pickCopy(lang, videoStudioCopy.notWiredTitle)}</p>
              <p className="mt-1 text-xs opacity-90">{pickCopy(lang, videoStudioCopy.notWiredBody)}</p>
              {jobStatus.error ? (
                <p className="mt-2 break-words font-mono text-xs opacity-75">
                  {/* FE03 (LOW, pre-merge security gate): only render the raw
                      job error verbatim when it is one of our own greppable
                      `VI_*` codes (mirrors RenderPanel.tsx's `VI_*` handling
                      for its own error surface) — any other value (e.g.
                      arbitrary text a worker/job pipeline reported) falls back
                      to a generic message instead of being echoed verbatim. */}
                  {jobStatus.error.startsWith("VI_")
                    ? jobStatus.error
                    : pickCopy(lang, videoStudioCopy.jobErrorGeneric)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {jobStatus?.status === "queued" || jobStatus?.status === "running" ? (
          <div className="text-sm text-muted-foreground" data-testid={`${testId}-progress`}>
            {pickCopy(lang, { th: "กำลังประมวลผล...", en: "Processing..." })}
            {jobStatus.progress?.stage ? ` (${jobStatus.progress.stage})` : ""}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
