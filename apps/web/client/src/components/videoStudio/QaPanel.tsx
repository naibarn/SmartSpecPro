/**
 * QA & Compliance stage panel (Feature 133, section-08). Two concerns:
 *  1. Product-claim compliance editor (`document.claims`) — gates
 *     `queueRender(profile: "final")` server-side (`VI_CLAIM_VIOLATION`).
 *  2. `runQualityReview` — enqueues a real job (fully wired queue/ownership/
 *     traceId plumbing) whose LLM judgment step is intentionally NOT
 *     fabricated in Phase 1 (`VI_QUALITY_REVIEW_NOT_WIRED` — see
 *     `routers/videoProjects.ts`'s module doc comment). This panel NEVER
 *     hides the button (Guided mode still needs the stage visible per this
 *     section's authoritative instructions) — it enqueues, polls
 *     (resume-on-mount + >=2s interval), and shows a clear "not yet
 *     available" notice rather than crashing or pretending it succeeded.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Plus, RefreshCcw, Sparkles, Trash2 } from "lucide-react";

import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { trpc } from "@/lib/trpc";
import type { ClaimRecord, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { NotWiredJobCard } from "./NotWiredJobCard";
import { useGenerationJobPoll } from "./useGenerationJobPoll";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const CLAIM_STATUSES: ClaimRecord["status"][] = ["approved", "needs_review", "unsupported", "prohibited"];

const CLAIM_STATUS_BADGE: Record<ClaimRecord["status"], BadgeVariant> = {
  approved: "success",
  needs_review: "warning",
  unsupported: "neutral",
  prohibited: "error",
};

export function QaPanel({
  lang,
  projectId,
  document,
  onChange,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onChange: (next: VideoProjectDocument) => void;
}) {
  const reviewPoll = useGenerationJobPoll(projectId, "quality_review");
  const repairPoll = useGenerationJobPoll(projectId, "quality_repair");

  const runQualityReview = trpc.videoProjects.runQualityReview.useMutation({
    onSuccess: (result) => reviewPoll.setJobId(result.jobId),
  });
  const applyQualityRepairs = trpc.videoProjects.applyQualityRepairs.useMutation({
    onSuccess: (result) => repairPoll.setJobId(result.jobId),
  });

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

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-qa-panel">
      <NotWiredJobCard
        lang={lang}
        title={pickCopy(lang, { th: "การตรวจสอบคุณภาพด้วย AI", en: "AI quality review" })}
        buttonLabel={pickCopy(lang, videoStudioCopy.runQualityReview)}
        icon={<Sparkles className="h-4 w-4" />}
        testId="video-studio-run-quality-review"
        jobStatus={reviewPoll.jobStatus}
        disabled={runQualityReview.isPending}
        onRun={() => runQualityReview.mutate({ projectId })}
      />

      <NotWiredJobCard
        lang={lang}
        title={pickCopy(lang, { th: "ปรับปรุงคุณภาพอัตโนมัติ", en: "Automated quality repair" })}
        buttonLabel={pickCopy(lang, { th: "ใช้การแก้ไขจาก AI", en: "Apply AI repairs" })}
        icon={<RefreshCcw className="h-4 w-4" />}
        testId="video-studio-apply-quality-repairs"
        jobStatus={repairPoll.jobStatus}
        disabled={applyQualityRepairs.isPending}
        onRun={() => applyQualityRepairs.mutate({ projectId })}
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
                  <Badge variant={CLAIM_STATUS_BADGE[claim.status]} label={claim.status} />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-4 w-4" />}
                    label="remove claim"
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
                    options={CLAIM_STATUSES}
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
