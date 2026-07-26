import { useEffect, useMemo, useState } from "react";

export type StagedCheckpoint = {
  checkpointId: string;
  kind: string;
  shotId: number | null;
  state: string;
  revision: number;
  contentHash: string;
  estimatedCredits: number | null;
  consumed?: boolean;
  consumedAt?: string | null;
  consumedByOperationId?: string | null;
  approvedModel?: string | null;
  approvedProvider?: string | null;
  approvedSafetyVerdict?: string | null;
  approvedReferenceManifestHash?: string | null;
};

export type StagedReviewState = {
  runStatus?: string;
  currentStage?: string;
  outputMode?: string;
  stateDigest: string;
  planRevision: number;
  planReview: { status: string; redraftCount?: number };
  storyPlan?: { title?: string; storySummary?: string } | null;
  audioPlan?: {
    text?: string;
    language?: string;
    model?: string | null;
    provider?: string | null;
    estimatedCredits?: number;
  } | null;
  finalAssembly?: {
    contentHash?: string | null;
    shotCount?: number;
    hasAudio?: boolean;
    includeAudio?: boolean;
    shots?: Array<{ shotId: number }>;
  } | null;
  shots: Array<{
    shotId: number;
    state?: string | null;
    title?: string | null;
    visualSummary?: string | null;
    storySummary: string;
    dialogue: string;
    imagePrompt?: string | null;
    videoPrompt?: string | null;
    imageArtifactUrl?: string | null;
    imageArtifactHash?: string | null;
    videoArtifactUrl?: string | null;
    videoArtifactHash?: string | null;
    imageTaskStatus?: string | null;
    videoTaskStatus?: string | null;
  }>;
  checkpoints: StagedCheckpoint[];
  correctionRequired?: {
    stageKey?: string;
    shotId?: number | null;
    reasonCode?: string;
    retryable?: boolean;
  } | null;
};

export type StagedCheckpointEdit = {
  shotId?: number;
  storySummary?: string;
  dialogue?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  audioText?: string;
  audioLanguage?: string;
  finalShotOrder?: number[];
  includeAudio?: boolean;
};

export type StagedCheckpointRetry = {
  stage: "story" | "image" | "video" | "audio" | "final";
  shotId?: number;
  notes?: string;
};

function checkpointLabel(checkpoint: StagedCheckpoint): string {
  if (checkpoint.kind === "story_plan") return "เนื้อเรื่อง";
  if (checkpoint.kind === "image_prompt")
    return `Prompt ภาพช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "image_result")
    return `ผลภาพช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "video_prompt")
    return `Prompt วิดีโอช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "video_result")
    return `ผลวิดีโอช็อตที่ ${checkpoint.shotId}`;
  if (checkpoint.kind === "audio_plan") return "เสียง / TTS";
  return "การประกอบขั้นสุดท้าย";
}

function expected(checkpoint: StagedCheckpoint) {
  return {
    revision: checkpoint.revision,
    contentHash: checkpoint.contentHash,
    model: checkpoint.approvedModel || "internal",
    provider: checkpoint.approvedProvider || "internal",
    safetyVerdict: checkpoint.approvedSafetyVerdict || "passed",
    referenceManifestHash: checkpoint.approvedReferenceManifestHash || "none",
    estimatedCredits: checkpoint.estimatedCredits ?? 0,
  };
}

function isEditable(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(
    checkpoint &&
    ["awaiting", "rejected", "approved"].includes(checkpoint.state)
  );
}

function isConsumed(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(
    checkpoint?.consumed ||
    checkpoint?.consumedAt ||
    checkpoint?.consumedByOperationId
  );
}

function isRetryable(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(checkpoint?.state === "rejected" || isConsumed(checkpoint));
}

function isRetryAvailable(checkpoint: StagedCheckpoint | undefined) {
  return Boolean(checkpoint?.state === "awaiting" || isRetryable(checkpoint));
}

function isTaskInFlight(status: string | null | undefined) {
  return ["pending", "processing", "submitted"].includes(String(status ?? ""));
}

function isRunEditable(state: StagedReviewState) {
  return !["completed", "failed", "cancelled"].includes(
    String(state.runStatus ?? "")
  );
}

function checkpointStateLabel(state: string | undefined) {
  switch (state) {
    case "approved":
      return "ยืนยันแล้ว";
    case "rejected":
      return "รอแก้ไข";
    case "awaiting":
      return "รอตรวจ";
    case "consumed":
      return "ใช้แล้ว";
    case "superseded":
      return "แทนที่แล้ว";
    default:
      return "รอระบบ";
  }
}

function shotStateLabel(state: string | null | undefined) {
  switch (state) {
    case "image_prompt_awaiting":
      return "รอตรวจ Prompt ภาพ";
    case "image_generating":
      return "กำลังสร้างภาพ";
    case "image_result_awaiting":
      return "รอตรวจภาพ";
    case "video_prompt_awaiting":
      return "รอตรวจ Prompt วิดีโอ";
    case "video_generating":
      return "กำลังสร้างวิดีโอ";
    case "video_result_awaiting":
      return "รอตรวจวิดีโอ";
    case "story_awaiting":
      return "รอตรวจเนื้อเรื่อง";
    case "completed":
      return "พร้อมใช้งาน";
    default:
      return state ? state.replaceAll("_", " ") : "รอระบบเตรียมช็อต";
  }
}

function mediaTaskStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
    case "processing":
    case "submitted":
      return "กำลังประมวลผล";
    case "completed":
      return "สร้างเสร็จแล้ว";
    case "failed":
    case "cancelled":
      return "สร้างไม่สำเร็จ · กด retry ได้";
    default:
      return null;
  }
}

function checkpointStateClass(state: string) {
  switch (state) {
    case "approved":
    case "consumed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "rejected":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "awaiting":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

type WorkflowStep = {
  id: string;
  label: string;
  description: string;
  status: "done" | "current" | "needs_review" | "locked" | "skipped";
  completed: number;
  total: number;
};

function buildWorkflowSteps(state: StagedReviewState): WorkflowStep[] {
  const checkpoints = state.checkpoints.filter(
    checkpoint => checkpoint.state !== "superseded"
  );
  const shotsTotal = Math.max(state.shots.length, 1);
  const makeStep = (input: {
    id: string;
    label: string;
    description: string;
    kind: string;
    total?: number;
    skipped?: boolean;
  }): WorkflowStep => {
    if (input.skipped) {
      return { ...input, status: "skipped", completed: 0, total: 0 };
    }
    const total = input.total ?? 1;
    const relevant = checkpoints.filter(
      checkpoint => checkpoint.kind === input.kind
    );
    const approved = relevant.filter(
      checkpoint =>
        checkpoint.state === "approved" || checkpoint.state === "consumed"
    ).length;
    const hasRejected = relevant.some(
      checkpoint => checkpoint.state === "rejected"
    );
    const hasAwaiting = relevant.some(
      checkpoint => checkpoint.state === "awaiting"
    );
    const status = hasRejected
      ? "needs_review"
      : approved >= total
        ? "done"
        : hasAwaiting
          ? "current"
          : "locked";
    return { ...input, status, completed: Math.min(approved, total), total };
  };
  return [
    makeStep({
      id: "story",
      label: "เนื้อเรื่อง",
      description: "ตรวจ Story Arc และบทพูด",
      kind: "story_plan",
    }),
    makeStep({
      id: "image-prompt",
      label: "Prompt ภาพ",
      description: "ยืนยัน Prompt ก่อนสร้างภาพ",
      kind: "image_prompt",
      total: shotsTotal,
    }),
    makeStep({
      id: "image-result",
      label: "Storyboard Review / ผลภาพ",
      description: "ตรวจและรับรองภาพแต่ละช็อตก่อนสร้างวิดีโอ",
      kind: "image_result",
      total: shotsTotal,
    }),
    makeStep({
      id: "video-prompt",
      label: "Prompt วิดีโอ",
      description: "ยืนยัน Prompt ก่อนสร้างวิดีโอ",
      kind: "video_prompt",
      total: shotsTotal,
    }),
    makeStep({
      id: "video-result",
      label: "ผลวิดีโอ",
      description: "รับรองวิดีโอแต่ละช็อตก่อนทำงานเสียง",
      kind: "video_result",
      total: shotsTotal,
      skipped: state.outputMode === "storyboard_images",
    }),
    makeStep({
      id: "audio",
      label: "เสียง",
      description: "ตรวจข้อความและแผน TTS",
      kind: "audio_plan",
      skipped: !state.audioPlan,
    }),
    makeStep({
      id: "final",
      label: "ประกอบ",
      description: "ตรวจลำดับและยืนยัน output",
      kind: "final_assembly",
    }),
  ];
}

export function StagedCheckpointReviewPanel(props: {
  runId: string;
  state: StagedReviewState | null | undefined;
  loading?: boolean;
  error?: string | null;
  pending?: boolean;
  pendingAction?: string | null;
  onRefresh: () => void;
  onApprove: (input: {
    checkpoint: StagedCheckpoint;
    expected: ReturnType<typeof expected>;
  }) => void;
  onReject: (checkpoint: StagedCheckpoint) => void;
  onEdit: (input: StagedCheckpointEdit) => void;
  onGeneratePrompt: (input: {
    shotId: number;
    stage: "image" | "video";
  }) => void;
  onRetry: (input: StagedCheckpointRetry) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [redraftNotes, setRedraftNotes] = useState("");
  const [finalOrderDraft, setFinalOrderDraft] = useState("");
  const [includeAudioDraft, setIncludeAudioDraft] = useState<boolean | null>(
    null
  );
  useEffect(() => {
    setDrafts({});
    setRedraftNotes("");
    setFinalOrderDraft("");
    setIncludeAudioDraft(null);
  }, [props.state?.stateDigest]);
  const activeCheckpointByKey = useMemo(() => {
    const map = new Map<string, StagedCheckpoint>();
    for (const checkpoint of props.state?.checkpoints ?? []) {
      if (checkpoint.state !== "superseded")
        map.set(`${checkpoint.kind}:${checkpoint.shotId ?? "run"}`, checkpoint);
    }
    return map;
  }, [props.state?.checkpoints]);
  const runCheckpoint = (kind: string) =>
    activeCheckpointByKey.get(`${kind}:run`);
  const storyCheckpoint = runCheckpoint("story_plan");
  const storyEditAvailable =
    Boolean(props.state && isRunEditable(props.state)) &&
    Boolean(storyCheckpoint && storyCheckpoint.state !== "superseded");
  const audioCheckpoint = runCheckpoint("audio_plan");
  const finalCheckpoint = runCheckpoint("final_assembly");
  const finalOrder =
    props.state?.finalAssembly?.shots?.map(shot => shot.shotId) ?? [];
  const effectiveFinalOrder = finalOrderDraft || finalOrder.join(",");
  const effectiveIncludeAudio =
    includeAudioDraft ?? props.state?.finalAssembly?.includeAudio ?? true;
  const finalOrderValues = effectiveFinalOrder
    .split(",")
    .map(value => Number(value.trim()))
    .filter(Number.isInteger);
  const finalOrderIsValid =
    finalOrderValues.length === 9 &&
    new Set(finalOrderValues).size === 9 &&
    finalOrderValues.every(shotId => shotId >= 1 && shotId <= 9);
  const workflowSteps = props.state ? buildWorkflowSteps(props.state) : [];
  const completedWorkflowSteps = workflowSteps.filter(
    step => step.status === "done" || step.status === "skipped"
  ).length;
  const currentWorkflowStep =
    workflowSteps.find(
      step => step.status === "current" || step.status === "needs_review"
    ) ?? workflowSteps.find(step => step.status === "locked");
  if (!props.state && !props.loading && !props.error) return null;

  const action = (
    id: string,
    label: string,
    callback: () => void,
    className = "rounded border px-3 py-2 text-sm"
  ) => (
    <button
      type="button"
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={props.pending}
      aria-label={label}
      onClick={callback}
    >
      {props.pendingAction === id ||
      (props.pendingAction === "approve" && id.startsWith("approve-")) ||
      (props.pendingAction === "accept-image" &&
        id.startsWith("approve-image-result")) ||
      (props.pendingAction === "reject" && id.startsWith("reject-")) ||
      (props.pendingAction === "edit-shot" && id.startsWith("edit-")) ||
      (props.pendingAction === "generate-prompt" &&
        id.startsWith("generate-prompt-")) ||
      (props.pendingAction === "retry-shot" && id.startsWith("retry-")) ||
      (props.pendingAction === "retry-audio" && id.startsWith("retry-audio"))
        ? "กำลังดำเนินการ…"
        : label}
    </button>
  );

  return (
    <section
      className="mt-4 rounded-lg border border-violet-200 bg-violet-50/60 p-4"
      aria-labelledby={`staged-checkpoint-title-${props.runId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Staged Auto Review Workbench
          </p>
          <h3
            id={`staged-checkpoint-title-${props.runId}`}
            className="mt-1 text-base font-semibold text-slate-950"
          >
            ตรวจทีละขั้นก่อนใช้เครดิต
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            ตรวจเนื้อเรื่อง → ตรวจ Prompt ภาพ → Storyboard Review / ผลภาพ →
            ยืนยัน Prompt วิดีโอ → ตรวจผลวิดีโอ → ตรวจเสียง →
            ตรวจและยืนยันการประกอบ
          </p>
          <p className="mt-2 text-xs text-violet-700">
            ทุกช็อตแยกกัน: แก้ Prompt หรือ retry เฉพาะช็อตได้
            เครดิตภาพ/วิดีโอจะใช้เฉพาะตอนกดยืนยันสร้าง ส่วนการสร้าง Prompt
            อาจใช้เครดิต LLM แยกตาม policy
          </p>
        </div>
        {action("refresh", "รีเฟรชสถานะ", props.onRefresh)}
      </div>
      {props.loading ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          กำลังโหลด checkpoint…
        </p>
      ) : null}
      {props.error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {props.error}
        </p>
      ) : null}
      {props.state ? (
        <>
          <div
            className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-3 text-white shadow-sm"
            aria-label="ความคืบหน้า checkpoint"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-300">
                  Checkpoint progress
                </p>
                <p className="mt-1 text-sm font-medium">
                  {currentWorkflowStep
                    ? `ถัดไป: ${currentWorkflowStep.label}`
                    : "ตรวจครบทุกขั้นตอนแล้ว"}
                </p>
              </div>
              <p className="text-xs text-slate-300">
                {completedWorkflowSteps}/{workflowSteps.length} ขั้นตอนผ่าน
              </p>
            </div>
            <div
              className="mt-3 grid grid-flow-col auto-cols-[minmax(8.25rem,1fr)] gap-2 overflow-x-auto pb-1"
              role="list"
              aria-label="ลำดับ checkpoint"
            >
              {workflowSteps.map(step => (
                <div
                  key={step.id}
                  role="listitem"
                  className={`rounded-lg border px-3 py-2 ${step.status === "current" ? "border-violet-300 bg-violet-500/20" : step.status === "needs_review" ? "border-amber-300 bg-amber-500/20" : "border-white/10 bg-white/[0.05]"}`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-white">{step.label}</span>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 ${checkpointStateClass(step.status === "done" ? "approved" : step.status === "needs_review" ? "rejected" : step.status === "current" ? "awaiting" : "pending")}`}
                    >
                      {step.status === "done"
                        ? "ผ่าน"
                        : step.status === "needs_review"
                          ? "แก้ไข"
                          : step.status === "current"
                            ? "รอตรวจ"
                            : step.status === "skipped"
                              ? "ข้าม"
                              : "รอคิว"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-300">
                    {step.description}
                  </p>
                  {step.total > 1 ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {step.completed}/{step.total} ช็อต
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {props.state.correctionRequired ? (
            <div
              className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium">ขั้นตอนต้องตรวจแก้ก่อนทำงานต่อ</p>
              <p className="mt-1">
                {props.state.correctionRequired.reasonCode ||
                  "provider_correction_required"}
              </p>
              {props.state.correctionRequired.stageKey === "audio_generation"
                ? action("retry-audio", "ลองแผนเสียงใหม่", () =>
                    props.onRetry({ stage: "audio" })
                  )
                : null}
              {props.state.correctionRequired.shotId &&
              (props.state.correctionRequired.stageKey === "image_generation" ||
                props.state.correctionRequired.stageKey === "video_generation")
                ? action(
                    "retry-provider-shot",
                    `ลองช็อตที่ ${props.state.correctionRequired.shotId} ใหม่`,
                    () =>
                      props.onRetry({
                        shotId: props.state!.correctionRequired!.shotId!,
                        stage:
                          props.state!.correctionRequired!.stageKey ===
                          "image_generation"
                            ? "image"
                            : "video",
                      })
                  )
                : null}
            </div>
          ) : null}

          <div className="mt-3 rounded-md border border-violet-100 bg-white p-3">
            <p className="font-medium text-slate-900">
              {props.state.storyPlan?.title || "Story Arc"}
            </p>
            <label className="mt-2 block text-sm font-medium text-slate-800">
              เรื่องย่อ
              <textarea
                className="mt-1 min-h-20 w-full rounded border p-2 text-sm font-normal"
                value={
                  drafts["story:summary"] ??
                  props.state.storyPlan?.storySummary ??
                  ""
                }
                onChange={event =>
                  setDrafts(prev => ({
                    ...prev,
                    "story:summary": event.target.value,
                  }))
                }
                disabled={!storyEditAvailable || props.pending}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {storyCheckpoint?.state === "awaiting"
                ? action(
                    "approve-story",
                    "ยืนยันเนื้อเรื่อง",
                    () =>
                      props.onApprove({
                        checkpoint: storyCheckpoint,
                        expected: expected(storyCheckpoint),
                      }),
                    "rounded bg-amber-700 px-3 py-2 text-sm text-white"
                  )
                : null}
              {storyEditAvailable &&
              (drafts["story:summary"] ??
                props.state.storyPlan?.storySummary ??
                "") !== (props.state.storyPlan?.storySummary ?? "")
                ? action(
                    "edit-story",
                    "บันทึกเรื่องย่อ",
                    () =>
                      props.onEdit({ storySummary: drafts["story:summary"] }),
                    "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                  )
                : null}
              {storyCheckpoint && storyCheckpoint.state === "awaiting"
                ? action("reject-story", "ขอแก้เนื้อเรื่อง", () =>
                    props.onReject(storyCheckpoint)
                  )
                : null}
              {storyEditAvailable
                ? action(
                    "retry-story",
                    "ร่างเนื้อเรื่องใหม่",
                    () =>
                      props.onRetry({
                        stage: "story",
                        notes: redraftNotes.trim(),
                      }),
                    "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                  )
                : null}
            </div>
            {storyCheckpoint && storyCheckpoint.state === "awaiting" ? (
              <label className="mt-2 block text-xs text-slate-600">
                หมายเหตุสำหรับร่างใหม่
                <textarea
                  className="mt-1 min-h-12 w-full rounded border p-2 text-xs"
                  value={redraftNotes}
                  onChange={event => setRedraftNotes(event.target.value)}
                />
              </label>
            ) : null}
          </div>

          {props.state.audioPlan ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
              <p className="font-medium text-slate-900">แผนเสียง</p>
              <textarea
                className="mt-2 min-h-20 w-full rounded border p-2"
                value={drafts["audio:text"] ?? props.state.audioPlan.text ?? ""}
                onChange={event =>
                  setDrafts(prev => ({
                    ...prev,
                    "audio:text": event.target.value,
                  }))
                }
                disabled={!isEditable(audioCheckpoint) || props.pending}
              />
              <p className="mt-1 text-xs text-slate-500">
                ภาษา {props.state.audioPlan.language || "th"} ·{" "}
                {props.state.audioPlan.model || "ไม่ระบุโมเดล"} · ~
                {props.state.audioPlan.estimatedCredits ?? 0} เครดิต
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {audioCheckpoint?.state === "awaiting"
                  ? action(
                      "approve-audio",
                      "ยืนยันเสียง",
                      () =>
                        props.onApprove({
                          checkpoint: audioCheckpoint,
                          expected: expected(audioCheckpoint),
                        }),
                      "rounded bg-amber-700 px-3 py-2 text-sm text-white"
                    )
                  : null}
                {audioCheckpoint && audioCheckpoint.state === "awaiting"
                  ? action("reject-audio", "ขอแก้แผนเสียง", () =>
                      props.onReject(audioCheckpoint)
                    )
                  : null}
                {audioCheckpoint &&
                isEditable(audioCheckpoint) &&
                (drafts["audio:text"] ?? props.state.audioPlan.text ?? "") !==
                  (props.state.audioPlan.text ?? "")
                  ? action(
                      "edit-audio",
                      "บันทึกแผนเสียง",
                      () => props.onEdit({ audioText: drafts["audio:text"] }),
                      "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                    )
                  : null}
                {isRetryAvailable(audioCheckpoint)
                  ? action("retry-audio-plan", "สร้างแผนเสียงใหม่", () =>
                      props.onRetry({ stage: "audio" })
                    )
                  : null}
              </div>
            </div>
          ) : null}

          {props.state.finalAssembly ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
              <p className="font-medium text-slate-900">การประกอบขั้นสุดท้าย</p>
              <p className="mt-1 text-slate-700">
                {props.state.finalAssembly.shotCount ?? 0} ช็อต ·{" "}
                {props.state.finalAssembly.hasAudio
                  ? "มีเสียง"
                  : "ไม่มีเสียงแยก"}
              </p>
              <label className="mt-2 block text-xs font-medium text-slate-700">
                ลำดับช็อต (เช่น 1,2,3)
                <input
                  className="mt-1 w-full rounded border p-2 text-sm"
                  value={effectiveFinalOrder}
                  onChange={event => setFinalOrderDraft(event.target.value)}
                  disabled={!isEditable(finalCheckpoint) || props.pending}
                />
              </label>
              {finalOrderDraft && !finalOrderIsValid ? (
                <p className="mt-1 text-xs text-amber-700" role="alert">
                  ลำดับต้องมีช็อต 1–9 ครบทุกหมายเลขและห้ามซ้ำ
                </p>
              ) : null}
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={effectiveIncludeAudio}
                  onChange={event => setIncludeAudioDraft(event.target.checked)}
                  disabled={!isEditable(finalCheckpoint) || props.pending}
                />{" "}
                ใช้เสียงประกอบใน final assembly
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {finalCheckpoint?.state === "awaiting"
                  ? action(
                      "approve-final",
                      "ยืนยันการประกอบ",
                      () =>
                        props.onApprove({
                          checkpoint: finalCheckpoint,
                          expected: expected(finalCheckpoint),
                        }),
                      "rounded bg-amber-700 px-3 py-2 text-sm text-white"
                    )
                  : null}
                {finalCheckpoint && finalCheckpoint.state === "awaiting"
                  ? action("reject-final", "ขอแก้การประกอบ", () =>
                      props.onReject(finalCheckpoint)
                    )
                  : null}
                {finalCheckpoint &&
                isEditable(finalCheckpoint) &&
                finalOrderIsValid &&
                (finalOrderDraft || includeAudioDraft !== null)
                  ? action(
                      "edit-final",
                      "บันทึกการประกอบ",
                      () =>
                        props.onEdit({
                          finalShotOrder: finalOrderValues,
                          includeAudio: effectiveIncludeAudio,
                        }),
                      "rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                    )
                  : null}
                {isRetryAvailable(finalCheckpoint)
                  ? action("retry-final", "สร้าง preview การประกอบใหม่", () =>
                      props.onRetry({ stage: "final" })
                    )
                  : null}
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-3">
            {props.state.shots.map(shot => {
              const imageCheckpoint = activeCheckpointByKey.get(
                `image_prompt:${shot.shotId}`
              );
              const imageResultCheckpoint = activeCheckpointByKey.get(
                `image_result:${shot.shotId}`
              );
              const videoCheckpoint = activeCheckpointByKey.get(
                `video_prompt:${shot.shotId}`
              );
              const videoResultCheckpoint = activeCheckpointByKey.get(
                `video_result:${shot.shotId}`
              );
              const storySummaryKey = `story:${shot.shotId}:summary`;
              const dialogueKey = `story:${shot.shotId}:dialogue`;
              const imageDraftKey = `image:${shot.shotId}`;
              const videoDraftKey = `video:${shot.shotId}`;
              const storyEditable = storyEditAvailable;
              return (
                <article
                  key={shot.shotId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
                        Shot {String(shot.shotId).padStart(2, "0")}
                      </p>
                      <h4 className="mt-1 font-semibold text-slate-900">
                        {shot.title || `ช็อตที่ ${shot.shotId}`}
                      </h4>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {shotStateLabel(shot.state)}
                    </span>
                  </div>
                  {shot.visualSummary ? (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {shot.visualSummary}
                    </p>
                  ) : null}
                  {storyEditable ? (
                    <>
                      <label className="mt-2 block text-sm font-medium text-slate-800">
                        เรื่องราวช็อต
                        <textarea
                          className="mt-1 min-h-16 w-full rounded border p-2 text-sm font-normal"
                          value={drafts[storySummaryKey] ?? shot.storySummary}
                          onChange={event =>
                            setDrafts(prev => ({
                              ...prev,
                              [storySummaryKey]: event.target.value,
                            }))
                          }
                          disabled={props.pending}
                        />
                      </label>
                      <label className="mt-2 block text-sm font-medium text-slate-800">
                        บทพูด
                        <textarea
                          className="mt-1 min-h-12 w-full rounded border p-2 text-sm font-normal"
                          value={drafts[dialogueKey] ?? shot.dialogue}
                          onChange={event =>
                            setDrafts(prev => ({
                              ...prev,
                              [dialogueKey]: event.target.value,
                            }))
                          }
                          disabled={props.pending}
                        />
                      </label>
                      {(drafts[storySummaryKey] ?? shot.storySummary) !==
                        shot.storySummary ||
                      (drafts[dialogueKey] ?? shot.dialogue) !== shot.dialogue
                        ? action(
                            `edit-story-shot-${shot.shotId}`,
                            `บันทึกเรื่องและบทพูดช็อตที่ ${shot.shotId}`,
                            () =>
                              props.onEdit({
                                shotId: shot.shotId,
                                storySummary: drafts[storySummaryKey],
                                dialogue: drafts[dialogueKey],
                              }),
                            "mt-2 rounded border border-amber-700 px-3 py-2 text-sm text-amber-800"
                          )
                        : null}
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-slate-700">
                        {shot.storySummary}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        <span className="font-medium">บทพูด:</span>{" "}
                        {shot.dialogue}
                      </p>
                    </>
                  )}
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-800">
                      <span className="flex items-center justify-between gap-2">
                        <span>Prompt ภาพ</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {imageCheckpoint
                            ? checkpointStateLabel(imageCheckpoint.state)
                            : "รอสร้างหลังยืนยันเนื้อเรื่อง"}
                        </span>
                      </span>
                      <textarea
                        className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 p-3 text-xs font-normal outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
                        placeholder="ระบบจะแสดง Prompt ภาพของช็อตนี้เมื่อเนื้อเรื่องผ่านการยืนยัน"
                        value={drafts[imageDraftKey] ?? shot.imagePrompt ?? ""}
                        aria-label={`Prompt ภาพช็อตที่ ${shot.shotId}`}
                        onChange={event =>
                          setDrafts(prev => ({
                            ...prev,
                            [imageDraftKey]: event.target.value,
                          }))
                        }
                        disabled={!isEditable(imageCheckpoint) || props.pending}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-800">
                      <span className="flex items-center justify-between gap-2">
                        <span>Prompt วิดีโอ</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {videoCheckpoint
                            ? checkpointStateLabel(videoCheckpoint.state)
                            : "รอรับรองภาพก่อน"}
                        </span>
                      </span>
                      <textarea
                        className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 p-3 text-xs font-normal outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
                        placeholder="ระบบจะแสดง Prompt วิดีโอหลังรับรองภาพของช็อตนี้"
                        value={drafts[videoDraftKey] ?? shot.videoPrompt ?? ""}
                        aria-label={`Prompt วิดีโอช็อตที่ ${shot.shotId}`}
                        onChange={event =>
                          setDrafts(prev => ({
                            ...prev,
                            [videoDraftKey]: event.target.value,
                          }))
                        }
                        disabled={!isEditable(videoCheckpoint) || props.pending}
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                        <span>ภาพ / เฟรมอ้างอิง</span>
                        <span className="font-normal text-slate-500">
                          {mediaTaskStatusLabel(shot.imageTaskStatus) ||
                            (shot.imageArtifactUrl
                              ? "มีผลลัพธ์"
                              : "ยังไม่มีภาพ")}
                        </span>
                      </div>
                      {shot.imageArtifactUrl ? (
                        <img
                          src={shot.imageArtifactUrl}
                          alt={`ผลภาพช็อตที่ ${shot.shotId}`}
                          className="aspect-[9/16] max-h-[22rem] w-full object-contain"
                        />
                      ) : (
                        <div className="flex min-h-40 items-center justify-center p-5 text-center text-xs leading-5 text-slate-500">
                          ภาพของช็อตนี้จะแสดงที่นี่หลังจากกดยืนยันสร้างภาพ
                        </div>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                        <span>วิดีโอรายช็อต</span>
                        <span className="font-normal text-slate-500">
                          {mediaTaskStatusLabel(shot.videoTaskStatus) ||
                            (shot.videoArtifactUrl
                              ? "มีผลลัพธ์"
                              : "ยังไม่มีวิดีโอ")}
                        </span>
                      </div>
                      {shot.videoArtifactUrl ? (
                        <video
                          className="aspect-[9/16] max-h-[22rem] w-full object-contain"
                          controls
                          preload="metadata"
                          src={shot.videoArtifactUrl}
                          aria-label={`ผลวิดีโอช็อตที่ ${shot.shotId}`}
                        />
                      ) : (
                        <div className="flex min-h-40 items-center justify-center p-5 text-center text-xs leading-5 text-slate-500">
                          วิดีโอของช็อตนี้จะแสดงที่นี่หลังจากยืนยัน Prompt
                          วิดีโอ
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    {[
                      imageCheckpoint,
                      imageResultCheckpoint,
                      videoCheckpoint,
                      videoResultCheckpoint,
                    ]
                      .filter(Boolean)
                      .map(checkpoint => (
                        <span
                          key={checkpoint!.checkpointId}
                          className="rounded bg-slate-100 px-2 py-1"
                        >
                          {checkpointLabel(checkpoint!)}: {checkpoint!.state}
                          {checkpoint!.estimatedCredits
                            ? ` · ~${checkpoint!.estimatedCredits} เครดิต`
                            : ""}
                        </span>
                      ))}
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <section
                      className="rounded-xl border border-violet-200 bg-violet-50/60 p-3"
                      aria-label={`การทำงานภาพช็อตที่ ${shot.shotId}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">
                        1 · Prompt ภาพ → ภาพ / เฟรมอ้างอิง
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        แก้หรือสร้าง Prompt ก่อน แล้วค่อยยืนยันสร้างภาพเพื่อใช้เครดิตภาพ
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {imageCheckpoint &&
                        isEditable(imageCheckpoint) &&
                        !isTaskInFlight(shot.imageTaskStatus) &&
                        !isTaskInFlight(shot.videoTaskStatus)
                          ? action(
                              `generate-prompt-image-${shot.shotId}`,
                              `สร้าง Prompt ภาพช็อตที่ ${shot.shotId} ใหม่`,
                              () =>
                                props.onGeneratePrompt({
                                  shotId: shot.shotId,
                                  stage: "image",
                                }),
                              "rounded border border-violet-300 bg-white px-3 py-2 text-sm text-violet-800"
                            )
                          : null}
                        {imageCheckpoint?.state === "awaiting"
                          ? action(
                              `approve-image-${shot.shotId}`,
                              `ยืนยันสร้างภาพช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onApprove({
                                  checkpoint: imageCheckpoint,
                                  expected: expected(imageCheckpoint),
                                }),
                              "rounded bg-violet-700 px-3 py-2 text-sm text-white"
                            )
                          : null}
                        {imageCheckpoint?.state === "awaiting"
                          ? action(
                              `reject-image-${shot.shotId}`,
                              `ขอแก้ Prompt ภาพช็อตที่ ${shot.shotId}`,
                              () => props.onReject(imageCheckpoint)
                            )
                          : null}
                        {imageCheckpoint &&
                        isEditable(imageCheckpoint) &&
                        (drafts[imageDraftKey] ?? shot.imagePrompt ?? "") !==
                          (shot.imagePrompt ?? "")
                          ? action(
                              `edit-image-${shot.shotId}`,
                              `บันทึก Prompt ภาพช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onEdit({
                                  shotId: shot.shotId,
                                  imagePrompt: drafts[imageDraftKey],
                                }),
                              "rounded border border-slate-700 px-3 py-2 text-sm"
                            )
                          : null}
                        {imageCheckpoint?.state === "rejected" ||
                        (isConsumed(imageCheckpoint) &&
                          imageResultCheckpoint?.state === "approved")
                          ? action(
                              `retry-image-prompt-${shot.shotId}`,
                              `เริ่มตรวจ Prompt ภาพช็อตที่ ${shot.shotId} ใหม่`,
                              () =>
                                props.onRetry({
                                  shotId: shot.shotId,
                                  stage: "image",
                                })
                            )
                          : null}
                        {imageResultCheckpoint?.state === "awaiting"
                          ? action(
                              `approve-image-result-${shot.shotId}`,
                              `ยอมรับผลภาพช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onApprove({
                                  checkpoint: imageResultCheckpoint,
                                  expected: expected(imageResultCheckpoint),
                                }),
                              "rounded bg-emerald-700 px-3 py-2 text-sm text-white"
                            )
                          : null}
                        {imageResultCheckpoint?.state === "awaiting"
                          ? action(
                              `reject-image-result-${shot.shotId}`,
                              `ปฏิเสธผลภาพช็อตที่ ${shot.shotId}`,
                              () => props.onReject(imageResultCheckpoint)
                            )
                          : null}
                        {imageResultCheckpoint?.state === "rejected"
                          ? action(
                              `retry-image-${shot.shotId}`,
                              `สร้างภาพช็อตที่ ${shot.shotId} ใหม่`,
                              () =>
                                props.onRetry({
                                  shotId: shot.shotId,
                                  stage: "image",
                                })
                            )
                          : null}
                      </div>
                    </section>
                    <section
                      className="rounded-xl border border-sky-200 bg-sky-50/60 p-3"
                      aria-label={`การทำงานวิดีโอช็อตที่ ${shot.shotId}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                        2 · Prompt วิดีโอ → วิดีโอรายช็อต
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        ต้องยอมรับภาพของช็อตนี้ก่อน แล้วค่อยสร้างหรือยืนยัน Prompt
                        วิดีโอเพื่อใช้เครดิตวิดีโอ
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {videoCheckpoint &&
                        shot.imageArtifactHash &&
                        imageResultCheckpoint?.state === "approved" &&
                        isEditable(videoCheckpoint) &&
                        !isTaskInFlight(shot.videoTaskStatus)
                          ? action(
                              `generate-prompt-video-${shot.shotId}`,
                              `สร้าง Prompt วิดีโอช็อตที่ ${shot.shotId} ใหม่`,
                              () =>
                                props.onGeneratePrompt({
                                  shotId: shot.shotId,
                                  stage: "video",
                                }),
                              "rounded border border-sky-300 bg-white px-3 py-2 text-sm text-sky-800"
                            )
                          : null}
                        {videoCheckpoint?.state === "awaiting"
                          ? action(
                              `approve-video-${shot.shotId}`,
                              `ยืนยันและสร้างวิดีโอช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onApprove({
                                  checkpoint: videoCheckpoint,
                                  expected: expected(videoCheckpoint),
                                }),
                              "rounded bg-sky-700 px-3 py-2 text-sm text-white"
                            )
                          : null}
                        {videoCheckpoint?.state === "awaiting"
                          ? action(
                              `reject-video-${shot.shotId}`,
                              `ขอแก้ Prompt วิดีโอช็อตที่ ${shot.shotId}`,
                              () => props.onReject(videoCheckpoint)
                            )
                          : null}
                        {videoCheckpoint &&
                        isEditable(videoCheckpoint) &&
                        (drafts[videoDraftKey] ?? shot.videoPrompt ?? "") !==
                          (shot.videoPrompt ?? "")
                          ? action(
                              `edit-video-${shot.shotId}`,
                              `บันทึก Prompt วิดีโอช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onEdit({
                                  shotId: shot.shotId,
                                  videoPrompt: drafts[videoDraftKey],
                                }),
                              "rounded border border-slate-700 px-3 py-2 text-sm"
                            )
                          : null}
                        {videoCheckpoint?.state === "rejected"
                          ? action(
                              `retry-video-prompt-${shot.shotId}`,
                              `เริ่มตรวจ Prompt วิดีโอช็อตที่ ${shot.shotId} ใหม่`,
                              () =>
                                props.onRetry({
                                  shotId: shot.shotId,
                                  stage: "video",
                                })
                            )
                          : null}
                        {videoResultCheckpoint?.state === "awaiting"
                          ? action(
                              `approve-video-result-${shot.shotId}`,
                              `ยอมรับผลวิดีโอช็อตที่ ${shot.shotId}`,
                              () =>
                                props.onApprove({
                                  checkpoint: videoResultCheckpoint,
                                  expected: expected(videoResultCheckpoint),
                                }),
                              "rounded bg-emerald-700 px-3 py-2 text-sm text-white"
                            )
                          : null}
                        {videoResultCheckpoint?.state === "awaiting"
                          ? action(
                              `reject-video-result-${shot.shotId}`,
                              `ปฏิเสธผลวิดีโอช็อตที่ ${shot.shotId}`,
                              () => props.onReject(videoResultCheckpoint)
                            )
                          : null}
                        {videoResultCheckpoint?.state === "rejected" ||
                        (isConsumed(videoCheckpoint) &&
                          videoResultCheckpoint?.state === "approved")
                          ? action(
                              `retry-video-${shot.shotId}`,
                              `สร้างวิดีโอช็อตที่ ${shot.shotId} ใหม่`,
                              () =>
                                props.onRetry({
                                  shotId: shot.shotId,
                                  stage: "video",
                                })
                            )
                          : null}
                      </div>
                    </section>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
