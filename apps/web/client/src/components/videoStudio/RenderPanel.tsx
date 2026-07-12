/**
 * Render stage panel (Feature 133, section-08). Compiles the current saved
 * document (`trpc.videoProjects.compileProject`), previews it with
 * `RemotionProjectPreview` (`@remotion/player`), shows the render-cost
 * estimate, and submits Preview/Final renders via `queueRender`. Every
 * `VI_*` failure from the server is surfaced verbatim and specifically
 * (`VI_CLAIM_VIOLATION`, `VI_SEGMENTED_RENDER_NOT_SUPPORTED`,
 * `VI_DOCUMENT_INVALID`) — never swallowed into a generic message.
 *
 * IMPORTANT: this panel operates on the project's currently SAVED document
 * (server-compiled), not the unsaved in-memory draft — the workspace page
 * disables render actions while there are unsaved changes so the preview
 * and the real render can never silently diverge from what the user sees.
 */
import { Link } from "wouter";
import { AlertTriangle, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { RemotionProjectPreview } from "./RemotionProjectPreview";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export function RenderPanel({
  lang,
  projectId,
  hasUnsavedChanges,
}: {
  lang: VideoStudioLang;
  projectId: number;
  hasUnsavedChanges: boolean;
}) {
  const compileQuery = trpc.videoProjects.compileProject.useQuery(
    { projectId },
    { enabled: !hasUnsavedChanges, retry: false },
  );
  const costQuery = trpc.videoProjects.getRenderCostEstimate.useQuery(
    { projectId },
    { enabled: !hasUnsavedChanges, retry: false },
  );

  const queueRender = trpc.videoProjects.queueRender.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.created
          ? pickCopy(lang, { th: "ส่งงานเรนเดอร์แล้ว", en: "Render job submitted" })
          : pickCopy(lang, { th: "มีงานเรนเดอร์อยู่แล้ว", en: "A render job is already running" }),
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (hasUnsavedChanges) {
    return (
      <div data-testid="video-studio-render-panel" className="flex flex-col gap-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{pickCopy(lang, videoStudioCopy.unsavedChanges)}</AlertTitle>
          <AlertDescription>
            {pickCopy(lang, {
              th: "บันทึกการเปลี่ยนแปลงก่อนดูตัวอย่างหรือเรนเดอร์",
              en: "Save your changes before previewing or rendering.",
            })}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (compileQuery.isLoading) {
    return (
      <div data-testid="video-studio-render-panel" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {pickCopy(lang, videoStudioCopy.loading)}
      </div>
    );
  }

  if (compileQuery.isError) {
    return (
      <div data-testid="video-studio-render-panel">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{pickCopy(lang, videoStudioCopy.compileError)}</AlertTitle>
          <AlertDescription data-testid="video-studio-compile-error">
            {compileQuery.error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const compiled = compileQuery.data;

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-render-panel">
      {compiled?.kind === "single" ? (
        <RemotionProjectPreview config={compiled.config} className="overflow-hidden rounded-xl border border-border/60" />
      ) : compiled?.kind === "segmented" ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{pickCopy(lang, videoStudioCopy.segmentedNotSupported)}</AlertTitle>
        </Alert>
      ) : null}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">{pickCopy(lang, videoStudioCopy.renderCostEstimate)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {costQuery.data ? (
            <>
              <Badge variant="outline">
                {pickCopy(lang, { th: "คะแนนต้นทุน", en: "Cost score" })}: {costQuery.data.cost.score}
              </Badge>
              <Badge variant="outline">
                {pickCopy(lang, { th: "ระดับต้นทุน", en: "Cost class" })}: {costQuery.data.cost.cls}
              </Badge>
              {costQuery.data.cost.recommendPreRender ? (
                <Badge variant="secondary">
                  {pickCopy(lang, {
                    th: "แนะนำให้เรนเดอร์ตัวอย่างก่อน",
                    en: "Pre-render preview recommended",
                  })}
                </Badge>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">{pickCopy(lang, videoStudioCopy.loading)}</span>
          )}
        </CardContent>
      </Card>

      {queueRender.isError ? (
        <Alert variant="destructive" data-testid="video-studio-render-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {queueRender.error.message.includes("VI_CLAIM_VIOLATION")
              ? pickCopy(lang, videoStudioCopy.claimViolation)
              : queueRender.error.message.includes("VI_SEGMENTED_RENDER_NOT_SUPPORTED")
                ? pickCopy(lang, videoStudioCopy.segmentedNotSupported)
                : queueRender.error.message.includes("VI_DOCUMENT_INVALID")
                  ? pickCopy(lang, videoStudioCopy.documentInvalid)
                  : pickCopy(lang, { th: "ส่งงานเรนเดอร์ไม่สำเร็จ", en: "Failed to submit render" })}
          </AlertTitle>
          <AlertDescription>{queueRender.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {queueRender.isSuccess ? (
        <Alert data-testid="video-studio-render-success">
          <PlayCircle className="h-4 w-4" />
          <AlertTitle>{pickCopy(lang, { th: "ส่งงานเรนเดอร์แล้ว", en: "Render submitted" })}</AlertTitle>
          <AlertDescription>
            <Link href="/render-jobs" className="underline">
              {pickCopy(lang, videoStudioCopy.viewRenderJob)}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={queueRender.isPending || compiled?.kind !== "single"}
          onClick={() => queueRender.mutate({ projectId, profile: "preview" })}
        >
          {pickCopy(lang, videoStudioCopy.renderPreview)}
        </Button>
        <Button
          disabled={queueRender.isPending || compiled?.kind !== "single"}
          onClick={() => queueRender.mutate({ projectId, profile: "final" })}
        >
          {pickCopy(lang, videoStudioCopy.renderFinal)}
        </Button>
      </div>
    </div>
  );
}
