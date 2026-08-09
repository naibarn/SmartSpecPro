/**
 * Shared launch shell for a Video Intelligence AI stage (Feature 142,
 * section-07) — a rework of the deleted `NotWiredJobCard` now that
 * sections 04-06 replaced its `VI_*_NOT_WIRED` throws with real work: same
 * "button + progress + terminal error + blocked-reason" shell, minus the
 * not-wired notice. `onRun` NEVER dispatches a mutation directly — it only
 * opens the caller's estimate dialog (decision D4); the caller wires
 * `StageEstimateDialog`'s `onConfirm` to the actual mutation. Never hides
 * the button (the Guided-mode rule inherited from `NotWiredJobCard`).
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { describeViError, pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

interface StageJobStatusLike {
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  progress: { stage: string; message?: string } | null;
}

export function StageLaunchCard({
  lang,
  title,
  buttonLabel,
  icon,
  testId,
  jobStatus,
  blockedReason,
  isPending,
  onRun,
  children,
}: {
  lang: VideoStudioLang;
  title: string;
  buttonLabel: string;
  icon?: React.ReactNode;
  testId: string;
  jobStatus?: StageJobStatusLike | null;
  /** Non-null = launch blocked; renders the reason banner and disables the
   *  button (never silently — spec §6.4 rule 2). */
  blockedReason?: { title: string; body?: string } | null;
  isPending?: boolean;
  /** Opens the estimate dialog — NEVER the mutation itself (D4). */
  onRun: () => void;
  children?: React.ReactNode;
}) {
  const isBusy = jobStatus?.status === "running" || jobStatus?.status === "queued";
  const isBlocked = Boolean(blockedReason);

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={4}>{title}</Heading>

        {children}

        {blockedReason ? (
          <Banner
            status="warning"
            data-testid={`${testId}-blocked`}
            title={blockedReason.title}
            description={blockedReason.body}
          />
        ) : null}

        <Button
          type="button"
          variant="secondary"
          data-testid={testId}
          label={buttonLabel}
          icon={icon}
          isDisabled={isBlocked || isBusy || isPending}
          isLoading={isBusy || isPending}
          onClick={onRun}
          className="self-start"
        />

        {jobStatus?.status === "failed" ? (
          <Banner
            status="error"
            data-testid={`${testId}-error`}
            title={pickCopy(lang, videoStudioCopy.stageFailedTitle)}
            description={describeViError(lang, jobStatus.error)}
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
