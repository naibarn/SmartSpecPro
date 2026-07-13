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
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Link } from "wouter";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";

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

  if (compileQuery.isError) {
    return (
      <div data-testid="video-studio-render-panel">
        <Banner
          status="error"
          data-testid="video-studio-compile-error"
          title={pickCopy(lang, videoStudioCopy.compileError)}
          description={compileQuery.error.message}
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
        <Banner status="warning" title={pickCopy(lang, videoStudioCopy.segmentedNotSupported)} />
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
          title={
            queueRender.error.message.includes("VI_CLAIM_VIOLATION")
              ? pickCopy(lang, videoStudioCopy.claimViolation)
              : queueRender.error.message.includes("VI_SEGMENTED_RENDER_NOT_SUPPORTED")
                ? pickCopy(lang, videoStudioCopy.segmentedNotSupported)
                : queueRender.error.message.includes("VI_DOCUMENT_INVALID")
                  ? pickCopy(lang, videoStudioCopy.documentInvalid)
                  : pickCopy(lang, { th: "ส่งงานเรนเดอร์ไม่สำเร็จ", en: "Failed to submit render" })
          }
          description={queueRender.error.message}
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

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          isDisabled={queueRender.isPending || compiled?.kind !== "single"}
          isLoading={queueRender.isPending}
          label={pickCopy(lang, videoStudioCopy.renderPreview)}
          onClick={() => queueRender.mutate({ projectId, profile: "preview" })}
        />
        <Button
          variant="primary"
          isDisabled={queueRender.isPending || compiled?.kind !== "single"}
          isLoading={queueRender.isPending}
          label={pickCopy(lang, videoStudioCopy.renderFinal)}
          onClick={() => queueRender.mutate({ projectId, profile: "final" })}
        />
      </div>
    </div>
  );
}
