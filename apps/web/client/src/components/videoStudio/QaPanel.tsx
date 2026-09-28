/**
 * QA & Compliance stage panel (Feature 133, section-08; reworked in Feature
 * 142, section-07 now that `runQualityReview`/`applyQualityRepairs` are
 * real). Four concerns:
 *  1. Product-claim compliance editor (`document.claims`) — gates
 *     `queueRender(profile: "final")` server-side (`VI_CLAIM_VIOLATION`).
 *  2. `runQualityReview` — a real scorecard: overall score, per-dimension
 *     bars (keys are OPEN — never a fixed dimension list), issues grouped by
 *     severity, and a distinct claim-compliance GATE banner.
 *  3. `applyQualityRepairs` — per-stage repair buttons labelled by cost
 *     class (`isZeroCostRepairStage`).
 *  4. Round history from `qaLedger` with before/after score delta and
 *     one-click revert via the EXISTING `restoreRevision` procedure (D1
 *     safety net for repairs the user never approved line-by-line).
 *
 * Every launch goes through `StageEstimateDialog` (D4) — the Run button only
 * opens the dialog; the mutation fires from the dialog's `onConfirm`.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCcw, Sparkles, Trash2 } from "lucide-react";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { trpc } from "@/lib/trpc";
import type { ClaimRecord, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { QaLedgerEntry } from "@shared/videoIntelligence/qaLedger";
import {
  deriveClaimBlock,
  deriveQaReviewView,
  groupIssuesBySeverity,
  isZeroCostRepairStage,
} from "./qaPanelState";
import { StageEstimateDialog, type StageEstimate } from "./StageEstimateDialog";
import { StageLaunchCard } from "./StageLaunchCard";
import { useGenerationJobPoll } from "./useGenerationJobPoll";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const CLAIM_STATUSES: ClaimRecord["status"][] = ["approved", "needs_review", "unsupported", "prohibited"];

const CLAIM_STATUS_BADGE: Record<ClaimRecord["status"], BadgeVariant> = {
  approved: "success",
  needs_review: "warning",
  unsupported: "neutral",
  prohibited: "error",
};

/** Parallel to `CLAIM_STATUS_BADGE` — Thai/English labels for the same
 *  closed enum (`ClaimRecord["status"]`), used for both the status Badge
 *  and the status Selector's options so neither leaks the raw enum value. */
const CLAIM_STATUS_LABEL: Record<ClaimRecord["status"], { th: string; en: string }> = {
  approved: { th: "อนุมัติแล้ว", en: "Approved" },
  needs_review: { th: "รอตรวจสอบ", en: "Needs review" },
  unsupported: { th: "ไม่มีหลักฐานสนับสนุน", en: "Unsupported" },
  prohibited: { th: "ต้องห้าม", en: "Prohibited" },
};

const REMOVE_CLAIM_LABEL = { th: "ลบข้อความอ้างสิทธิ์นี้", en: "Remove claim" };

const SEVERITY_BADGE: Record<"high" | "medium" | "low" | "unknown", BadgeVariant> = {
  high: "error",
  medium: "warning",
  low: "neutral",
  unknown: "neutral",
};

/** Closed set of repair-stage ids per `skills/video-project-quality-review/
 *  skill.md` (`repairStage`: `content | narration | scenes | motion |
 *  captions | claims`). `repairStageOptions` is DERIVED from server output
 *  though, so an unrecognized id must still render (fallback to the raw
 *  id) rather than disappear or throw. */
const REPAIR_STAGE_LABEL: Record<string, { th: string; en: string }> = {
  content: { th: "เนื้อหา/บท", en: "Content" },
  narration: { th: "เสียงพากย์", en: "Narration" },
  scenes: { th: "ฉาก", en: "Scenes" },
  motion: { th: "โมชัน", en: "Motion" },
  captions: { th: "ซับไทเทิล", en: "Captions" },
  claims: { th: "การอ้างสิทธิ์สินค้า", en: "Claims" },
};

function repairStageLabel(lang: VideoStudioLang, stage: string): string {
  const known = REPAIR_STAGE_LABEL[stage];
  return known ? pickCopy(lang, known) : stage;
}

/** Known scorecard dimension keys per `skills/video-project-quality-review/
 *  skill.md` §"Scoring, issues, and repair instructions". The scorecard is
 *  explicitly OPEN-keyed (the skill may introduce new dimensions, and
 *  `issue.dimension` reuses the same key names) — any key missing from this
 *  map MUST still render via the English-ish fallback, never dropped. */
const DIMENSION_LABEL: Record<string, { th: string; en: string }> = {
  content_accuracy_flow: { th: "ความถูกต้อง/ลำดับของเนื้อหา", en: "Content accuracy & flow" },
  hook_cta_clarity: { th: "ความชัดเจนของ Hook/CTA", en: "Hook / CTA clarity" },
  length_fit: { th: "ความยาวเหมาะสม", en: "Length fit" },
  natural_spoken_language: { th: "ภาษาพูดเป็นธรรมชาติ", en: "Natural spoken language" },
  product_claim_compliance: { th: "การปฏิบัติตามข้อกำหนดการอ้างสิทธิ์สินค้า", en: "Product claim compliance" },
  product_fidelity: { th: "ความตรงกับสินค้าจริง", en: "Product fidelity" },
  visual_narration_match: { th: "ภาพตรงกับคำบรรยาย", en: "Visual-narration match" },
  scene_variety: { th: "ความหลากหลายของฉาก", en: "Scene variety" },
  motion_clutter: { th: "ความรกของโมชัน", en: "Motion clutter" },
  text_overflow_readability: { th: "ข้อความล้น/อ่านง่าย", en: "Text overflow & readability" },
  safe_area_compliance: { th: "การอยู่ในพื้นที่ปลอดภัย", en: "Safe-area compliance" },
  technical: { th: "ด้านเทคนิค", en: "Technical" },
};

function humanizeDimension(lang: VideoStudioLang, key: string): string {
  const known = DIMENSION_LABEL[key];
  if (known) return pickCopy(lang, known);
  // Open-keyed fallback for dimensions the skill introduces later.
  return key.replace(/_/g, " ");
}

export function QaPanel({
  lang,
  projectId,
  document,
  onChange,
  qaLedger,
  projectRevision,
  hasUnsavedChanges,
  onDocumentSaved,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onChange: (next: VideoProjectDocument) => void;
  /** `video_projects.qaLedger` — `unknown`-shaped (jsonb round-trip). */
  qaLedger: unknown;
  projectRevision: number;
  hasUnsavedChanges: boolean;
  /** Fired once per terminal job/restore transition so the workspace resets
   *  `baseRevision` and refetches — otherwise the next Save silently
   *  overwrites what the AI/repair/restore just wrote (spec §6.4). */
  onDocumentSaved: () => void;
}) {
  const reviewPoll = useGenerationJobPoll(projectId, "quality_review");
  const repairPoll = useGenerationJobPoll(projectId, "quality_repair");

  const [reviewEstimateOpen, setReviewEstimateOpen] = useState(false);
  const [repairEstimateOpen, setRepairEstimateOpen] = useState(false);
  const [selectedRepairStages, setSelectedRepairStages] = useState<string[]>([]);
  const [revertTarget, setRevertTarget] = useState<QaLedgerEntry | null>(null);

  const handledReviewJobId = useRef<string | null>(null);
  const handledRepairJobId = useRef<string | null>(null);

  const reviewEstimateQuery = trpc.videoProjects.getStageEstimate.useQuery(
    { projectId, stage: "quality_review" },
    { enabled: reviewEstimateOpen, staleTime: 0 },
  );
  const repairEstimateQuery = trpc.videoProjects.getStageEstimate.useQuery(
    { projectId, stage: "quality_repair" },
    { enabled: repairEstimateOpen, staleTime: 0 },
  );

  const runQualityReview = trpc.videoProjects.runQualityReview.useMutation({
    onSuccess: (result) => {
      reviewPoll.setJobId(result.jobId);
      setReviewEstimateOpen(false);
    },
  });
  const applyQualityRepairs = trpc.videoProjects.applyQualityRepairs.useMutation({
    onSuccess: (result) => {
      repairPoll.setJobId(result.jobId);
      setRepairEstimateOpen(false);
    },
  });
  const restoreRevision = trpc.videoProjects.restoreRevision.useMutation({
    onSuccess: () => {
      setRevertTarget(null);
      onDocumentSaved();
    },
  });

  // Fire onDocumentSaved exactly once per terminal transition — guarded on
  // the jobId already handled, or the refetch fights the poll (spec §6.4).
  useEffect(() => {
    if (
      reviewPoll.jobStatus?.status === "succeeded" &&
      reviewPoll.jobId &&
      handledReviewJobId.current !== reviewPoll.jobId
    ) {
      handledReviewJobId.current = reviewPoll.jobId;
      onDocumentSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewPoll.jobStatus?.status, reviewPoll.jobId]);

  useEffect(() => {
    if (
      repairPoll.jobStatus?.status === "succeeded" &&
      repairPoll.jobId &&
      handledRepairJobId.current !== repairPoll.jobId
    ) {
      handledRepairJobId.current = repairPoll.jobId;
      onDocumentSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repairPoll.jobStatus?.status, repairPoll.jobId]);

  const reviewView = deriveQaReviewView({
    qaLedger,
    projectRevision,
    hasUnsavedChanges,
    jobStatus: reviewPoll.jobStatus,
  });
  const repairView = deriveQaReviewView({
    qaLedger,
    projectRevision,
    hasUnsavedChanges,
    jobStatus: repairPoll.jobStatus,
  });

  const latestJobResult =
    repairPoll.jobStatus?.status === "succeeded"
      ? repairPoll.jobStatus.result
      : reviewPoll.jobStatus?.status === "succeeded"
        ? reviewPoll.jobStatus.result
        : undefined;
  const claimBlock = deriveClaimBlock({ document, jobResult: latestJobResult });

  const review = reviewView.latest?.review ?? null;
  const issueGroups = review ? groupIssuesBySeverity(review) : [];
  const repairStageOptions = review
    ? Array.from(
        new Set([
          ...(review.repairInstructions?.map((r) => r.stage) ?? []),
          ...review.issues.map((i) => i.repairStage).filter((s): s is string => Boolean(s)),
        ]),
      )
    : [];

  const unsavedBlockedReason = hasUnsavedChanges
    ? { title: pickCopy(lang, videoStudioCopy.unsavedChanges), body: pickCopy(lang, videoStudioCopy.saveBeforeRunning) }
    : null;

  function toggleRepairStage(stage: string, checked: boolean) {
    setSelectedRepairStages((prev) => (checked ? [...prev, stage] : prev.filter((s) => s !== stage)));
  }

  function updateClaim(index: number, patch: Partial<ClaimRecord>) {
    const claims = document.claims.map((claim, i) => (i === index ? { ...claim, ...patch } : claim));
    onChange({ ...document, claims });
  }

  function addClaim() {
    onChange({
      ...document,
      claims: [...document.claims, { claim: "", source: "manual", status: "needs_review" }],
    });
  }

  function removeClaim(index: number) {
    onChange({ ...document, claims: document.claims.filter((_, i) => i !== index) });
  }

  // Newest first for display, without mutating the ledger's storage order.
  const ledgerEntries = (() => {
    try {
      const raw = qaLedger as { entries?: unknown } | null | undefined;
      const entries = Array.isArray(raw?.entries) ? (raw!.entries as QaLedgerEntry[]) : [];
      return [...entries].reverse();
    } catch {
      return [];
    }
  })();

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-qa-panel">
      <StageLaunchCard
        lang={lang}
        title={pickCopy(lang, { th: "การตรวจสอบคุณภาพด้วย AI", en: "AI quality review" })}
        buttonLabel={pickCopy(lang, videoStudioCopy.runQualityReview)}
        icon={<Sparkles className="h-4 w-4" />}
        testId="video-studio-run-quality-review"
        jobStatus={reviewPoll.jobStatus}
        blockedReason={unsavedBlockedReason}
        isPending={runQualityReview.isPending}
        onRun={() => setReviewEstimateOpen(true)}
      />

      {reviewEstimateOpen ? (
        <StageEstimateDialog
          lang={lang}
          open={reviewEstimateOpen}
          onOpenChange={setReviewEstimateOpen}
          stage="quality_review"
          estimate={reviewEstimateQuery.data as StageEstimate | undefined}
          isLoading={reviewEstimateQuery.isLoading}
          error={reviewEstimateQuery.error?.message}
          isConfirming={runQualityReview.isPending}
          onConfirm={() => runQualityReview.mutate({ projectId, baseRevision: projectRevision })}
        />
      ) : null}

      {/* Scorecard */}
      {reviewView.status === "empty" ? (
        <Card>
          <Text type="body" color="secondary" data-testid="video-studio-qa-empty">
            {pickCopy(lang, videoStudioCopy.qaEmpty)}
          </Text>
        </Card>
      ) : review ? (
        <Card data-testid="video-studio-qa-scorecard">
          <VStack gap={3}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <HStack gap={2} align="center">
                <Heading level={4}>{pickCopy(lang, videoStudioCopy.qaScore)}</Heading>
                <Text type="body" weight="bold">
                  {review.score}/10
                </Text>
                <Badge
                  variant={review.score >= document.qa.targetScore ? "success" : "warning"}
                  label={review.score >= document.qa.targetScore ? "OK" : pickCopy(lang, { th: "ต่ำกว่าเป้าหมาย", en: "Below target" })}
                />
              </HStack>
              {reviewView.actualCreditsUsed != null ? (
                <Text type="supporting" color="secondary">
                  {pickCopy(lang, videoStudioCopy.creditsActual)}: {reviewView.actualCreditsUsed}
                </Text>
              ) : null}
            </HStack>

            {reviewView.isStale ? (
              <Banner
                status="warning"
                data-testid="video-studio-qa-stale"
                title={
                  reviewView.staleReason === "unsaved_changes"
                    ? pickCopy(lang, videoStudioCopy.qaStaleUnsaved)
                    : pickCopy(lang, videoStudioCopy.qaStale)
                }
                endContent={
                  <Button
                    variant="secondary"
                    size="sm"
                    label={pickCopy(lang, videoStudioCopy.qaRerun)}
                    onClick={() => setReviewEstimateOpen(true)}
                  />
                }
              />
            ) : null}

            {reviewView.status === "error" && reviewView.failedButPossiblyBilled ? (
              <Banner
                status="error"
                data-testid="video-studio-qa-failed-not-free"
                title={pickCopy(lang, videoStudioCopy.creditsFailedNotFree)}
              />
            ) : null}

            <VStack gap={2}>
              {Object.entries(review.scorecard).map(([dimension, value]) => (
                <ProgressBar
                  key={dimension}
                  value={value}
                  max={10}
                  label={humanizeDimension(lang, dimension)}
                  hasValueLabel
                  formatValueLabel={(v) => `${v}/10`}
                  data-testid={`video-studio-qa-dimension-${dimension}`}
                />
              ))}
            </VStack>

            {claimBlock.blocked ? (
              <Banner
                status="error"
                data-testid="video-studio-qa-claim-block"
                title={pickCopy(lang, videoStudioCopy.qaClaimBlockTitle)}
                description={
                  claimBlock.source === "document"
                    ? pickCopy(lang, videoStudioCopy.qaClaimBlockFromDocument)
                    : undefined
                }
              />
            ) : null}

            <VStack gap={2}>
              {issueGroups.map((group) => (
                <VStack key={group.severity} gap={1} data-testid={`video-studio-qa-issues-${group.severity}`}>
                  <Text type="supporting" weight="bold" color="secondary">
                    {group.severity === "high"
                      ? pickCopy(lang, videoStudioCopy.qaIssuesHigh)
                      : group.severity === "medium"
                        ? pickCopy(lang, videoStudioCopy.qaIssuesMedium)
                        : group.severity === "low"
                          ? pickCopy(lang, videoStudioCopy.qaIssuesLow)
                          : pickCopy(lang, videoStudioCopy.qaIssuesUnknown)}
                  </Text>
                  {group.issues.map((issue, index) => (
                    <HStack key={index} gap={2} align="start">
                      <Badge
                        variant={SEVERITY_BADGE[group.severity]}
                        label={humanizeDimension(lang, issue.dimension)}
                      />
                      {/* Skill-authored, already in document.content.language —
                          rendered VERBATIM, never translated. */}
                      <Text type="body">{issue.message}</Text>
                    </HStack>
                  ))}
                </VStack>
              ))}
            </VStack>
          </VStack>
        </Card>
      ) : null}

      {/* Repair card */}
      <StageLaunchCard
        lang={lang}
        title={pickCopy(lang, { th: "ปรับปรุงคุณภาพอัตโนมัติ", en: "Automated quality repair" })}
        buttonLabel={pickCopy(lang, { th: "ใช้การแก้ไขจาก AI", en: "Apply AI repairs" })}
        icon={<RefreshCcw className="h-4 w-4" />}
        testId="video-studio-apply-quality-repairs"
        jobStatus={repairPoll.jobStatus}
        blockedReason={unsavedBlockedReason}
        isPending={applyQualityRepairs.isPending}
        onRun={() => setRepairEstimateOpen(true)}
      >
        {repairStageOptions.length > 0 ? (
          <VStack gap={1}>
            {repairStageOptions.map((stage) => (
              <HStack key={stage} gap={2} align="center">
                <CheckboxInput
                  label={repairStageLabel(lang, stage)}
                  value={selectedRepairStages.includes(stage)}
                  onChange={(checked) => toggleRepairStage(stage, checked)}
                  data-testid={`video-studio-qa-repair-stage-${stage}`}
                />
                <Badge
                  variant={isZeroCostRepairStage(stage) ? "success" : "warning"}
                  label={
                    isZeroCostRepairStage(stage)
                      ? pickCopy(lang, videoStudioCopy.repairFree)
                      : pickCopy(lang, videoStudioCopy.repairBillable)
                  }
                />
              </HStack>
            ))}
            <Button
              variant="secondary"
              size="sm"
              label={pickCopy(lang, videoStudioCopy.repairApplyAll)}
              onClick={() => setSelectedRepairStages(repairStageOptions)}
              className="self-start"
            />
          </VStack>
        ) : null}
      </StageLaunchCard>

      {repairEstimateOpen ? (
        <StageEstimateDialog
          lang={lang}
          open={repairEstimateOpen}
          onOpenChange={setRepairEstimateOpen}
          stage="quality_repair"
          estimate={repairEstimateQuery.data as StageEstimate | undefined}
          isLoading={repairEstimateQuery.isLoading}
          error={repairEstimateQuery.error?.message}
          isConfirming={applyQualityRepairs.isPending}
          onConfirm={() =>
            applyQualityRepairs.mutate({
              projectId,
              baseRevision: projectRevision,
              stages: selectedRepairStages,
            })
          }
        />
      ) : null}

      {repairView.status === "success" && repairView.actualCreditsUsed != null ? (
        <Text type="supporting" color="secondary">
          {pickCopy(lang, videoStudioCopy.creditsActual)}: {repairView.actualCreditsUsed}
        </Text>
      ) : null}
      {repairView.status === "error" && repairView.failedButPossiblyBilled ? (
        <Banner
          status="error"
          data-testid="video-studio-qa-repair-failed-not-free"
          title={pickCopy(lang, videoStudioCopy.creditsFailedNotFree)}
        />
      ) : null}

      {/* Round history */}
      {ledgerEntries.length > 0 ? (
        <Card>
          <VStack gap={3}>
            <Heading level={4}>{pickCopy(lang, videoStudioCopy.qaRound)}</Heading>
            {ledgerEntries.map((entry, displayIndex) => {
              const nextOlder = ledgerEntries[displayIndex + 1] ?? null;
              const delta = nextOlder ? entry.review.score - nextOlder.review.score : null;
              return (
                <Card key={`${entry.round}-${entry.at}`} variant="muted" padding={3}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <VStack gap={1}>
                      <Text type="body" weight="bold">
                        {pickCopy(lang, videoStudioCopy.qaRound)} {entry.round} — {entry.review.score}/10
                        {delta != null ? ` (${delta >= 0 ? "+" : ""}${delta})` : ""}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {new Date(entry.at).toLocaleString()} · {entry.review.issues.length}{" "}
                        {pickCopy(lang, { th: "ปัญหา", en: "issue(s)" })} · {entry.creditsUsed}{" "}
                        {pickCopy(lang, { th: "เครดิต", en: "credits" })} · {entry.modelId ?? "-"}
                      </Text>
                    </VStack>
                    <Button
                      variant="secondary"
                      size="sm"
                      label={pickCopy(lang, videoStudioCopy.qaRevert)}
                      data-testid={`video-studio-qa-round-${entry.round}-revert`}
                      onClick={() => setRevertTarget(entry)}
                    />
                  </HStack>
                </Card>
              );
            })}
          </VStack>
        </Card>
      ) : null}

      <AlertDialog
        isOpen={revertTarget != null}
        onOpenChange={(open) => !open && setRevertTarget(null)}
        title={pickCopy(lang, videoStudioCopy.qaRevert)}
        description={pickCopy(lang, videoStudioCopy.qaRevertConfirm)}
        actionLabel={pickCopy(lang, videoStudioCopy.qaRevert)}
        actionVariant="destructive"
        isActionLoading={restoreRevision.isPending}
        onAction={() => {
          if (revertTarget) {
            restoreRevision.mutate({ projectId, revision: revertTarget.revision });
          }
        }}
      />

      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "การอ้างสิทธิ์สินค้า", en: "Product claims" })}</Heading>

          {document.claims.length === 0 ? (
            <Text type="body" color="secondary">
              {pickCopy(lang, { th: "ยังไม่มีข้อความอ้างสิทธิ์", en: "No claims yet." })}
            </Text>
          ) : null}

          {document.claims.map((claim, index) => (
            <Card key={index} variant="muted" padding={3}>
              <VStack gap={2}>
                <HStack justify="between" align="center" gap={2}>
                  <Badge
                    variant={CLAIM_STATUS_BADGE[claim.status]}
                    label={pickCopy(lang, CLAIM_STATUS_LABEL[claim.status])}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-4 w-4" />}
                    label={pickCopy(lang, REMOVE_CLAIM_LABEL)}
                    onClick={() => removeClaim(index)}
                  />
                </HStack>
                <TextInput
                  label={pickCopy(lang, { th: "ข้อความอ้างสิทธิ์", en: "Claim text" })}
                  value={claim.claim}
                  onChange={(value) => updateClaim(index, { claim: value })}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <TextInput
                    label={pickCopy(lang, { th: "แหล่งที่มา", en: "Source" })}
                    value={claim.source}
                    onChange={(value) => updateClaim(index, { source: value })}
                  />
                  <Selector
                    label={pickCopy(lang, { th: "สถานะ", en: "Status" })}
                    options={CLAIM_STATUSES.map((status) => ({
                      value: status,
                      label: pickCopy(lang, CLAIM_STATUS_LABEL[status]),
                    }))}
                    value={claim.status}
                    onChange={(value) => updateClaim(index, { status: value as ClaimRecord["status"] })}
                  />
                </div>
              </VStack>
            </Card>
          ))}

          <Button
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            label={pickCopy(lang, { th: "เพิ่มข้อความอ้างสิทธิ์", en: "Add claim" })}
            onClick={addClaim}
            className="self-start"
          />
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "เกณฑ์คุณภาพ", en: "QA target" })}</Heading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberInput
              label={pickCopy(lang, { th: "คะแนนเป้าหมาย", en: "Target score" })}
              min={0}
              max={10}
              value={document.qa.targetScore}
              onChange={(value) => onChange({ ...document, qa: { ...document.qa, targetScore: value } })}
            />
            <NumberInput
              label={pickCopy(lang, { th: "จำนวนรอบสูงสุด", en: "Max loops" })}
              min={0}
              max={20}
              isIntegerOnly
              value={document.qa.maxLoops}
              onChange={(value) => onChange({ ...document, qa: { ...document.qa, maxLoops: value } })}
            />
          </div>
        </VStack>
      </Card>
    </div>
  );
}
