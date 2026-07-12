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
 */
import { Plus, RefreshCcw, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import type { ClaimRecord, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { NotWiredJobCard } from "./NotWiredJobCard";
import { useGenerationJobPoll } from "./useGenerationJobPoll";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const CLAIM_STATUSES: ClaimRecord["status"][] = ["approved", "needs_review", "unsupported", "prohibited"];

const CLAIM_STATUS_BADGE: Record<ClaimRecord["status"], "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  needs_review: "outline",
  unsupported: "secondary",
  prohibited: "destructive",
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
        <CardHeader>
          <CardTitle className="text-base">
            {pickCopy(lang, { th: "การอ้างสิทธิ์สินค้า", en: "Product claims" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {document.claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, { th: "ยังไม่มีข้อความอ้างสิทธิ์", en: "No claims yet." })}
            </p>
          ) : null}
          {document.claims.map((claim, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={CLAIM_STATUS_BADGE[claim.status]}>{claim.status}</Badge>
                <Button variant="ghost" size="icon" onClick={() => removeClaim(index)} aria-label="remove claim">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-1.5">
                <Label>{pickCopy(lang, { th: "ข้อความอ้างสิทธิ์", en: "Claim text" })}</Label>
                <Input value={claim.claim} onChange={(e) => updateClaim(index, { claim: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>{pickCopy(lang, { th: "แหล่งที่มา", en: "Source" })}</Label>
                  <Input value={claim.source} onChange={(e) => updateClaim(index, { source: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{pickCopy(lang, { th: "สถานะ", en: "Status" })}</Label>
                  <Select
                    value={claim.status}
                    onValueChange={(value) => updateClaim(index, { status: value as ClaimRecord["status"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLAIM_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" className="self-start gap-2" onClick={addClaim}>
            <Plus className="h-4 w-4" />
            {pickCopy(lang, { th: "เพิ่มข้อความอ้างสิทธิ์", en: "Add claim" })}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {pickCopy(lang, { th: "เกณฑ์คุณภาพ", en: "QA target" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{pickCopy(lang, { th: "คะแนนเป้าหมาย", en: "Target score" })}</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={document.qa.targetScore}
              onChange={(e) =>
                onChange({ ...document, qa: { ...document.qa, targetScore: Number(e.target.value) || 0 } })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{pickCopy(lang, { th: "จำนวนรอบสูงสุด", en: "Max loops" })}</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={document.qa.maxLoops}
              onChange={(e) =>
                onChange({ ...document, qa: { ...document.qa, maxLoops: Number(e.target.value) || 0 } })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
