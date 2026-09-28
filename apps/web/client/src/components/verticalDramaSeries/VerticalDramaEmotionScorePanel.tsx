import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";

interface VerticalDramaEmotionScorePanelProps {
  seriesId: string;
  episodeId: string;
  locale?: "th" | "en";
  readOnly?: boolean;
}

const ACTIVE_ANALYSIS_STATUSES = new Set(["queued", "running"]);

function workerErrorState(error: string | null | undefined): string | null {
  if (!error) return null;
  const code = error.split(":", 1)[0];
  const states: Record<string, string> = {
    MODEL_NOT_INSTALLED: "worker_setup_blocked",
    GPU_UNAVAILABLE: "worker_setup_blocked",
    RUNTIME_INCOMPATIBLE: "worker_setup_blocked",
    PLAN_STALE: "needs_replan",
    VOCALS_DETECTED: "take_rejected",
    TAKE_TOO_SHORT: "take_rejected",
    QC_FAILED: "take_rejected",
    RIGHTS_REVIEW_REQUIRED: "rights_action_required",
    LICENSE_REVIEW_REQUIRED: "rights_action_required",
  };
  return states[code] ?? "analysis_failed";
}

/** Durable review surface for Feature 176/177. The panel deliberately exposes
 * only server-persisted state; it never invents a local score or audio result. */
export function VerticalDramaEmotionScorePanel({
  seriesId,
  episodeId,
  locale = "en",
  readOnly = false,
}: VerticalDramaEmotionScorePanelProps) {
  const [rightsEvidenceRef, setRightsEvidenceRef] = useState("");
  const [rightsScope, setRightsScope] = useState("project");
  const [critiqueResolutionNote, setCritiqueResolutionNote] = useState("");
  const utils = trpc.useUtils();
  const sourcesQuery = trpc.verticalDramaAudioScoring.getSources.useQuery({
    seriesId,
    episodeId,
  });
  const analysisQuery = trpc.verticalDramaAudioScoring.getAnalysis.useQuery(
    { seriesId, episodeId },
    { refetchInterval: 3000 }
  );
  const planQuery = trpc.verticalDramaAudioScoring.getPlan.useQuery(
    { seriesId, episodeId },
    { refetchInterval: 3000 }
  );
  const pipelineQuery = trpc.verticalDramaAudioScoring.getPipeline.useQuery(
    {
      seriesId,
      episodeId,
      ...(planQuery.data?.id ? { planId: String(planQuery.data.id) } : {}),
    },
    { refetchInterval: 3000, enabled: Boolean(planQuery.data?.id) }
  );
  const takesQuery = trpc.verticalDramaAudioScoring.listTakes.useQuery(
    {
      planId: String(
        planQuery.data?.id ?? "00000000-0000-0000-0000-000000000000"
      ),
    },
    {
      refetchInterval: 3000,
      enabled: Boolean(
        planQuery.data?.id &&
        planQuery.data.rightsStatus === "approved_for_project"
      ),
    }
  );
  const requestMutation =
    trpc.verticalDramaAudioScoring.requestAnalysis.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.verticalDramaAudioScoring.getAnalysis.invalidate({
            seriesId,
            episodeId,
          }),
          utils.verticalDramaAudioScoring.getPlan.invalidate({
            seriesId,
            episodeId,
          }),
        ]);
        toast.success(
          locale === "th" ? "ส่งงานวิเคราะห์แล้ว" : "Emotion analysis queued"
        );
      },
      onError: error => toast.error(error.message),
    });
  const cancelMutation =
    trpc.verticalDramaAudioScoring.cancelAnalysis.useMutation({
      onSuccess: () => void analysisQuery.refetch(),
      onError: error => toast.error(error.message),
    });
  const approveMutation =
    trpc.verticalDramaAudioScoring.approvePlan.useMutation({
      onSuccess: async () => {
        await utils.verticalDramaAudioScoring.getPlan.invalidate({
          seriesId,
          episodeId,
        });
        toast.success(
          locale === "th"
            ? "อนุมัติแผนเชิงความหมายแล้ว"
            : "Semantic plan approved"
        );
      },
      onError: error => toast.error(error.message),
    });
  const rightsMutation =
    trpc.verticalDramaAudioScoring.updateRightsStatus.useMutation({
      onSuccess: async () => {
        await utils.verticalDramaAudioScoring.getPlan.invalidate({
          seriesId,
          episodeId,
        });
      },
      onError: error => toast.error(error.message),
    });
  const resolveCritiqueMutation =
    trpc.verticalDramaAudioScoring.resolveCritique.useMutation({
      onSuccess: async () => {
        setCritiqueResolutionNote("");
        await utils.verticalDramaAudioScoring.getPlan.invalidate({
          seriesId,
          episodeId,
        });
      },
      onError: error => toast.error(error.message),
    });
  const queueMixMutation =
    trpc.verticalDramaAudioScoring.queueScoreMix.useMutation({
      onSuccess: async () => {
        await Promise.all([pipelineQuery.refetch(), takesQuery.refetch()]);
        toast.success(
          th ? "ส่งงานผสม score เข้า Worker แล้ว" : "Score mix queued to Worker"
        );
      },
      onError: error => toast.error(error.message),
    });

  const analysis = analysisQuery.data;
  const plan = planQuery.data;
  const parsedPlan = plan?.parsedPlan;
  const planIsStale = plan?.isStale === true;
  const isBusy =
    requestMutation.isPending ||
    ACTIVE_ANALYSIS_STATUSES.has(analysis?.status ?? "");
  const error =
    sourcesQuery.error?.message ??
    analysisQuery.error?.message ??
    planQuery.error?.message ??
    analysis?.error ??
    null;
  const errorState = workerErrorState(analysis?.error);
  const th = locale === "th";
  const [selectedTakeIds, setSelectedTakeIds] = useState<string[]>([]);
  const selectedTakeSet = useMemo(
    () => new Set(selectedTakeIds),
    [selectedTakeIds]
  );

  return (
    <Card data-testid="vd-emotion-score-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>
            {th ? "วิเคราะห์อารมณ์และวางแผนเพลง" : "Emotion score & music plan"}
          </span>
          <span className="flex items-center gap-2">
            {readOnly ? (
              <Badge variant="secondary">
                {th ? "อ่านอย่างเดียว" : "Read only"}
              </Badge>
            ) : null}
            {analysis?.status ? (
              <Badge variant="outline">{analysis.status}</Badge>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error ? (
          <p role="alert" className="flex gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
        {errorState ? (
          <p className="text-xs text-muted-foreground" role="status">
            {th ? `สถานะระบบ: ${errorState}` : `System state: ${errorState}`}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {th
            ? "ใช้ source snapshot ของ episode และ skill ที่มี provenance; ต้องตรวจสอบโดยมนุษย์ก่อนนำไปใช้จริง"
            : "Uses an episode source snapshot and versioned skill provenance; human review is required before use."}
        </p>
        {sourcesQuery.data ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="vd-emotion-source-hash"
          >
            {th ? "แหล่งข้อมูล" : "Source"}:{" "}
            {sourcesQuery.data.sourceHash.slice(0, 12)}… ·{" "}
            {sourcesQuery.data.sourceRevision}
          </p>
        ) : null}
        {!analysis || analysis.status === "failed" ? (
          <Button
            type="button"
            size="sm"
            onClick={() =>
              requestMutation.mutate({
                seriesId,
                episodeId,
                idempotencyKey: crypto.randomUUID(),
              })
            }
            disabled={readOnly || isBusy || sourcesQuery.isLoading}
            data-testid="vd-emotion-request-analysis"
          >
            {requestMutation.isPending ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {analysis?.status === "failed"
              ? th
                ? "วิเคราะห์ใหม่"
                : "Retry analysis"
              : th
                ? "เริ่มวิเคราะห์"
                : "Analyze episode"}
          </Button>
        ) : null}
        {analysis && ACTIVE_ANALYSIS_STATUSES.has(analysis.status) ? (
          <div
            className="flex items-center gap-2 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {th
              ? "กำลังประมวลผลด้วย skill…"
              : "Processing with the approved skill…"}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() =>
                cancelMutation.mutate({ analysisId: String(analysis.id) })
              }
              disabled={readOnly || cancelMutation.isPending}
            >
              {th ? "ยกเลิก" : "Cancel"}
            </Button>
          </div>
        ) : null}
        {analysis?.status === "canceled" ? (
          <p className="text-muted-foreground">
            {th
              ? "ยกเลิกงานแล้ว สามารถเริ่มใหม่ได้"
              : "Analysis canceled. You can start a new run."}
          </p>
        ) : null}
        {parsedPlan ? (
          <div
            className="space-y-2 rounded-md border p-3"
            data-testid="vd-emotion-plan-review"
          >
            {planIsStale ? (
              <p
                className="flex gap-2 text-amber-700 dark:text-amber-300"
                role="alert"
              >
                <AlertTriangle
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                {th
                  ? "แผนนี้ล้าสมัยหลัง episode ถูกแก้ไข กรุณาวิเคราะห์ใหม่ก่อนอนุมัติ"
                  : "This plan is stale because the episode changed. Re-run analysis before approval."}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              {parsedPlan.status === "approved" ? (
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="h-4 w-4 text-amber-600"
                  aria-hidden="true"
                />
              )}
              <span className="font-medium">
                {th
                  ? `แผน revision ${parsedPlan.semanticRevision}`
                  : `Plan revision ${parsedPlan.semanticRevision}`}
              </span>
              <Badge variant="outline" className="ml-auto">
                {plan?.rightsStatus ?? "unreviewed"}
              </Badge>
            </div>
            <p>
              {th
                ? `${parsedPlan.regions.length} ช่วงอารมณ์ · ${parsedPlan.cues.length} cue`
                : `${parsedPlan.regions.length} emotion regions · ${parsedPlan.cues.length} cues`}
            </p>
            <p className="text-xs text-muted-foreground">
              {parsedPlan.skill.modelProvider} / {parsedPlan.skill.modelId} ·{" "}
              {parsedPlan.skill.executionId}
            </p>
            {parsedPlan.status !== "approved" &&
            parsedPlan.critiqueDisposition !== "approved" &&
            parsedPlan.critiqueDisposition !== "human_resolved" ? (
              <section className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {th
                    ? "ผล critique ต้องได้รับการทบทวนและระบุเหตุผลการแก้ไขโดยมนุษย์ก่อนอนุมัติ"
                    : "The critique must be reviewed and explicitly resolved by a human before approval."}
                </p>
                <span className="flex flex-wrap gap-2">
                  <Input
                    value={critiqueResolutionNote}
                    onChange={event =>
                      setCritiqueResolutionNote(event.target.value)
                    }
                    placeholder={th ? "เหตุผลการทบทวน" : "Resolution reason"}
                    aria-label={
                      th
                        ? "เหตุผลการทบทวน critique"
                        : "Critique resolution reason"
                    }
                    className="max-w-md"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      resolveCritiqueMutation.mutate({
                        planId: String(plan.id),
                        planHash: parsedPlan.planHash,
                        resolutionNote: critiqueResolutionNote,
                      })
                    }
                    disabled={
                      readOnly ||
                      resolveCritiqueMutation.isPending ||
                      critiqueResolutionNote.trim().length < 3
                    }
                  >
                    {th ? "ยืนยันการทบทวน" : "Resolve critique"}
                  </Button>
                </span>
              </section>
            ) : null}
            {parsedPlan.status !== "approved" &&
            !planIsStale &&
            (parsedPlan.critiqueDisposition === "approved" ||
              parsedPlan.critiqueDisposition === "human_resolved") ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  approveMutation.mutate({
                    planId: String(plan.id),
                    planHash: parsedPlan.planHash,
                  })
                }
                disabled={readOnly || approveMutation.isPending}
                data-testid="vd-emotion-approve-plan"
              >
                {th ? "อนุมัติแผน" : "Approve semantic plan"}
              </Button>
            ) : plan?.rightsStatus !== "approved_for_project" ? (
              <section className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {th
                    ? "สิทธิ์ต้องมีหลักฐานและขอบเขตแยกจากการอนุมัติอารมณ์"
                    : "Rights approval is independent and requires evidence plus an explicit scope."}
                </p>
                <span className="flex flex-wrap gap-2">
                  <Input
                    value={rightsEvidenceRef}
                    onChange={event => setRightsEvidenceRef(event.target.value)}
                    placeholder={
                      th ? "รหัสหลักฐานสิทธิ์" : "Rights evidence reference"
                    }
                    aria-label={
                      th ? "รหัสหลักฐานสิทธิ์" : "Rights evidence reference"
                    }
                    className="max-w-xs"
                  />
                  <Input
                    value={rightsScope}
                    onChange={event => setRightsScope(event.target.value)}
                    placeholder={th ? "ขอบเขต" : "Scope"}
                    aria-label={th ? "ขอบเขตสิทธิ์" : "Rights scope"}
                    className="max-w-[12rem]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      rightsMutation.mutate({
                        planId: String(plan.id),
                        rightsStatus: "approved_for_project",
                        evidenceRef: rightsEvidenceRef,
                        scope: rightsScope,
                      })
                    }
                    disabled={
                      readOnly ||
                      rightsMutation.isPending ||
                      !rightsEvidenceRef.trim() ||
                      !rightsScope.trim()
                    }
                  >
                    {th ? "อนุมัติสิทธิ์โครงการ" : "Approve project rights"}
                  </Button>
                </span>
              </section>
            ) : null}
          </div>
        ) : null}
        {parsedPlan?.status === "approved" ? (
          <section
            className="space-y-2 rounded-md border p-3"
            data-testid="vd-audio-worker-pipeline"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {th
                  ? "คิว Worker และหลักฐานผลลัพธ์"
                  : "Worker queue & evidence"}
              </p>
              <Badge variant="outline">
                {pipelineQuery.isFetching
                  ? th
                    ? "กำลังตรวจสอบ"
                    : "Refreshing"
                  : th
                    ? "อัปเดตอัตโนมัติ"
                    : "Auto-refresh"}
              </Badge>
            </div>
            <div className="grid gap-1 text-xs sm:grid-cols-3">
              {(pipelineQuery.data?.stages ?? [])
                .filter(stage => stage.stage !== "approved_plan")
                .map(stage => (
                  <div key={stage.stage} className="rounded border px-2 py-1">
                    <span className="text-muted-foreground">{stage.stage}</span>
                    <span className="ml-2 font-medium">
                      {stage.job?.status ??
                        (stage.stage === "episode_audio_analyze"
                          ? "waiting"
                          : "blocked")}
                    </span>
                  </div>
                ))}
            </div>
            {pipelineQuery.data?.jobs.some(
              job =>
                job.jobType === "episode_audio_analyze" &&
                [
                  "queued",
                  "claimed",
                  "preparing",
                  "running",
                  "uploading",
                  "publishing",
                ].includes(job.status)
            ) ? (
              <p className="text-xs text-muted-foreground" role="status">
                {th
                  ? "Worker กำลังสร้าง ASR และ edit-map จาก final cut ที่มี checksum"
                  : "Worker is producing artifact-backed ASR and edit-map from the checksummed final cut."}
              </p>
            ) : null}
            {pipelineQuery.data?.jobs.some(
              job =>
                job.jobType === "minimax_music3_generate" &&
                [
                  "queued",
                  "claimed",
                  "preparing",
                  "running",
                  "uploading",
                  "publishing",
                ].includes(job.status)
            ) ? (
              <p className="text-xs text-muted-foreground" role="status">
                {th
                  ? "กำลังสร้างเพลงด้วย genuine MiniMax Music 3; ยังไม่ถือว่าสำเร็จจนกว่าจะมี artifact และ provenance"
                  : "Genuine MiniMax Music 3 generation is running; success is withheld until artifact and provenance publication."}
              </p>
            ) : null}
            {pipelineQuery.data?.terminalFailures?.length ? (
              <p className="text-xs text-destructive" role="alert">
                {pipelineQuery.data.terminalFailures
                  .map(
                    item => `${item.jobType}: ${item.failureReason ?? "failed"}`
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {takesQuery.data?.takes?.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">
                  {th
                    ? "Music 3 takes ที่ publish แล้ว"
                    : "Published Music 3 takes"}
                </p>
                {takesQuery.data.takes.map(take => (
                  <label
                    key={take.artifactId}
                    className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTakeSet.has(take.artifactId)}
                      onChange={event =>
                        setSelectedTakeIds(current =>
                          event.target.checked
                            ? [...current, take.artifactId]
                            : current.filter(id => id !== take.artifactId)
                        )
                      }
                      aria-label={`${take.cueId ?? "take"} ${take.artifactId}`}
                    />
                    <span className="font-medium">{take.cueId ?? "take"}</span>
                    <span className="text-muted-foreground">
                      {take.modelName} / {take.modelRevision}
                    </span>
                    <span className="text-muted-foreground">
                      {take.measuredLufs ?? "—"} LUFS
                    </span>
                    <span className="text-muted-foreground">
                      sha {take.checksum.slice(0, 10)}…
                    </span>
                  </label>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    queueMixMutation.mutate({
                      planId: String(plan?.id),
                      selectedTakeIds,
                    })
                  }
                  disabled={
                    readOnly ||
                    !selectedTakeIds.length ||
                    queueMixMutation.isPending
                  }
                >
                  {queueMixMutation.isPending ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {th ? "ส่งผสม score / QC" : "Queue score mix / QC"}
                </Button>
              </div>
            ) : plan?.rightsStatus === "approved_for_project" ? (
              <p className="text-xs text-muted-foreground">
                {th
                  ? "รอ Worker สร้างและ publish music take ที่ผ่าน provenance"
                  : "Waiting for the Worker to publish provenance-backed Music 3 takes."}
              </p>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
