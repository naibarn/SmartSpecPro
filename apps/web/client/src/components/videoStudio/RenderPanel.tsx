/**
 * Render stage panel (Feature 133, section-08). Compiles the current saved
 * document (`trpc.videoProjects.compileProject`), previews it with
 * `RemotionProjectPreview` (`@remotion/player`), shows the render-cost
 * estimate, and submits Preview/Final renders via `queueRender`. Every
 * `VI_*` failure from the server is mapped to a specific Thai/English
 * message via `describeViError`'s `VI_ERROR_COPY` table (this task) —
 * never swallowed into the generic fallback when the code is known, and
 * never echoed verbatim (that was the pre-existing `VI_DOCUMENT_INVALID`
 * raw-Zod-dump bug this task fixes).
 *
 * "เรนเดอร์ไฟล์จริง" (final render) is the single most credit-expensive
 * action in this app, so — like every other paid stage (scene plan, QA
 * review/repair, auto-draft) — it goes through an estimate/confirm gate
 * (decision D4) before `queueRender` is ever called. Preview render stays
 * one-click (it's the cheap/fast option) but states its cost inline.
 *
 * IMPORTANT: this panel operates on the project's currently SAVED document
 * (server-compiled), not the unsaved in-memory draft — the workspace page
 * disables render actions while there are unsaved changes so the preview
 * and the real render can never silently diverge from what the user sees.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useState } from "react";
import { Link } from "wouter";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { trpc } from "@/lib/trpc";
import { RemotionProjectPreview } from "./RemotionProjectPreview";
import { describeViError, pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export function RenderPanel({
  lang,
  projectId,
  hasUnsavedChanges,
  onGoToQa,
}: {
  lang: VideoStudioLang;
  projectId: number;
  hasUnsavedChanges: boolean;
  /** `VI_CLAIM_VIOLATION` is actionable, not a dump: routes the user back to
   *  the QA stage (Feature 142, section-07 §6.7). */
  onGoToQa: () => void;
}) {
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);

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
      setFinalConfirmOpen(false);
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
        <Banner
          status="warning"
          title={pickCopy(lang, videoStudioCopy.unsavedChanges)}
          description={pickCopy(lang, {
            th: "บันทึกการเปลี่ยนแปลงก่อนดูตัวอย่างหรือเรนเดอร์",
            en: "Save your changes before previewing or rendering.",
          })}
        />
      </div>
    );
  }

  if (compileQuery.isLoading) {
    return (
      <HStack data-testid="video-studio-render-panel" gap={2} align="center">
        <Spinner size="sm" />
        <Text type="body" color="secondary">
          {pickCopy(lang, videoStudioCopy.loading)}
        </Text>
      </HStack>
    );
  }

  // Fatal only on a FIRST-load failure — TanStack v5 keeps reporting
  // `isError` after a failed background refetch even though the last
  // successful compile is still in `data`, and swapping the whole panel for
  // the banner there hides a usable render surface.
  if (compileQuery.isError && !compileQuery.data) {
    return (
      <div data-testid="video-studio-render-panel">
        <Banner
          status="error"
          data-testid="video-studio-compile-error"
          title={pickCopy(lang, videoStudioCopy.compileError)}
          // FE03 (documented rule this banner previously bypassed): never
          // echo `compileQuery.error.message` verbatim — route it through
          // the same `VI_*` allowlist/mapping the queueRender banner below
          // uses, so an arbitrary server error is never rendered raw.
          description={describeViError(lang, compileQuery.error.message)}
        />
      </div>
    );
  }

  const compiled = compileQuery.data;

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-render-panel">
      {compiled?.kind === "single" ? (
        <RemotionProjectPreview config={compiled.config} className="overflow-hidden rounded-xl border border-border/60" />
      ) : compiled?.kind === "segmented" ? (
        <RemotionProjectPreview config={compiled.parts} className="overflow-hidden rounded-xl border border-border/60" />
      ) : null}

      {compiled?.kind === "segmented" ? (
        <Banner status="success" title={pickCopy(lang, videoStudioCopy.segmentedNotSupported)} />
      ) : null}

      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, videoStudioCopy.renderCostEstimate)}</Heading>
          <HStack gap={2} wrap="wrap">
            {costQuery.data ? (
              <>
                <Badge
                  variant="neutral"
                  label={`${pickCopy(lang, { th: "คะแนนต้นทุน", en: "Cost score" })}: ${costQuery.data.cost.score}`}
                />
                <Badge
                  variant="neutral"
                  label={`${pickCopy(lang, { th: "ระดับต้นทุน", en: "Cost class" })}: ${costQuery.data.cost.cls}`}
                />
                {costQuery.data.cost.recommendPreRender ? (
                  <Badge
                    variant="info"
                    label={pickCopy(lang, {
                      th: "แนะนำให้เรนเดอร์ตัวอย่างก่อน",
                      en: "Pre-render preview recommended",
                    })}
                  />
                ) : null}
              </>
            ) : (
              <Text type="body" color="secondary">
                {pickCopy(lang, videoStudioCopy.loading)}
              </Text>
            )}
          </HStack>
        </VStack>
      </Card>

      {queueRender.isError ? (
        <Banner
          status="error"
          data-testid="video-studio-render-error"
          title={pickCopy(lang, { th: "ส่งงานเรนเดอร์ไม่สำเร็จ", en: "Failed to submit render" })}
          // Full `VI_*` -> Thai/English map (this task); unknown/non-`VI_`
          // errors fall back to the generic message. Never echoes a raw
          // error (e.g. a Zod dump) verbatim.
          description={describeViError(lang, queueRender.error.message)}
          endContent={
            queueRender.error.message.includes("VI_CLAIM_VIOLATION") ? (
              <Button
                variant="secondary"
                size="sm"
                label={pickCopy(lang, videoStudioCopy.goToQa)}
                onClick={onGoToQa}
              />
            ) : undefined
          }
        />
      ) : null}

      {queueRender.isSuccess ? (
        <Banner
          status="success"
          data-testid="video-studio-render-success"
          icon={<PlayCircle className="h-4 w-4" />}
          title={pickCopy(lang, { th: "ส่งงานเรนเดอร์แล้ว", en: "Render submitted" })}
          description={
            <Link href="/render-jobs" className="underline">
              {pickCopy(lang, videoStudioCopy.viewRenderJob)}
            </Link>
          }
        />
      ) : null}

      <div className="flex flex-wrap gap-4">
        <VStack gap={1}>
          <Button
            variant="secondary"
            isDisabled={queueRender.isPending || compiled?.kind !== "single"}
            isLoading={queueRender.isPending}
            label={pickCopy(lang, videoStudioCopy.renderPreview)}
            onClick={() => queueRender.mutate({ projectId, profile: "preview" })}
          />
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.renderPreviewHelper)}
          </Text>
        </VStack>
        <VStack gap={1}>
          <Button
            variant="primary"
            isDisabled={queueRender.isPending || compiled?.kind !== "single"}
            isLoading={queueRender.isPending}
            label={pickCopy(lang, videoStudioCopy.renderFinal)}
            onClick={() => setFinalConfirmOpen(true)}
          />
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.renderFinalHelper)}
          </Text>
        </VStack>
      </div>

      <AlertDialog
        isOpen={finalConfirmOpen}
        onOpenChange={setFinalConfirmOpen}
        data-testid="render-final-confirm"
        title={pickCopy(lang, videoStudioCopy.renderFinalConfirmTitle)}
        description={pickCopy(lang, videoStudioCopy.renderFinalConfirmBody)}
        actionLabel={pickCopy(lang, videoStudioCopy.renderFinalConfirmAction)}
        actionVariant="primary"
        isActionLoading={queueRender.isPending}
        onAction={() => queueRender.mutate({ projectId, profile: "final" })}
      />
    </div>
  );
}
