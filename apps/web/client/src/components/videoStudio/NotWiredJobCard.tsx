/**
 * Shared card for a Phase-1 "job is queued/wired, but the LLM step is
 * intentionally not fabricated yet" action (Feature 133, section-08) —
 * used by `runScenePlanStage`, `runQualityReview`, `applyQualityRepairs`.
 * Never hides the action button; always shows a clear, specific notice
 * when the job comes back `failed` with a `VI_*_NOT_WIRED` error.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule. It also closes this file's hardcoded
 * `amber-500`/`amber-300` "not wired" notice gap by mapping it to Astryx's
 * theme-aware `Banner status="warning"` instead.
 */
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/Layout";
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
  const isBusy = jobStatus?.status === "running" || jobStatus?.status === "queued";

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={4}>{title}</Heading>

        <Button
          type="button"
          variant="secondary"
          data-testid={testId}
          label={buttonLabel}
          icon={icon}
          isDisabled={disabled}
          isLoading={isBusy}
          onClick={onRun}
          className="self-start"
        />

        {jobStatus?.status === "failed" ? (
          <Banner
            status="warning"
            data-testid={`${testId}-not-wired-notice`}
            title={pickCopy(lang, videoStudioCopy.notWiredTitle)}
            description={
              <VStack gap={1}>
                <span>{pickCopy(lang, videoStudioCopy.notWiredBody)}</span>
                {jobStatus.error ? (
                  <span className="break-words font-mono text-xs opacity-75">
                    {/* FE03 (LOW, pre-merge security gate): only render the raw
                        job error verbatim when it is one of our own greppable
                        `VI_*` codes (mirrors RenderPanel.tsx's `VI_*` handling
                        for its own error surface) — any other value (e.g.
                        arbitrary text a worker/job pipeline reported) falls back
                        to a generic message instead of being echoed verbatim. */}
                    {jobStatus.error.startsWith("VI_")
                      ? jobStatus.error
                      : pickCopy(lang, videoStudioCopy.jobErrorGeneric)}
                  </span>
                ) : null}
              </VStack>
            }
          />
        ) : null}

        {isBusy ? (
          <Text type="body" color="secondary" data-testid={`${testId}-progress`}>
            {pickCopy(lang, { th: "กำลังประมวลผล...", en: "Processing..." })}
            {jobStatus?.progress?.stage ? ` (${jobStatus.progress.stage})` : ""}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
