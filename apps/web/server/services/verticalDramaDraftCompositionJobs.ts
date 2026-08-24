import { randomUUID } from "node:crypto";
import { getRedisClient } from "./redis";
import { createHash } from "node:crypto";
import { calculateCreditsForLLM, deductCredits } from "./creditService";
import {
  synthesizeVerticalDramaPreset,
  synthesizeVerticalDramaPresetV2,
  type PresetSynthesisPresetInput,
  type PresetSynthesisPresetInputV2,
  type SynthesizedGenrePresetDraft,
} from "./verticalDramaPresetSynthesis";
import {
  completeVerticalDramaDraft,
  deductVerticalDramaDraftCompletionCredits,
} from "./verticalDramaDraftCompletion";
import {
  inspectVerticalDramaDraftCompleteness,
  verticalDramaDraftCompletionReportSchema,
  type VerticalDramaDraftCompletionReport,
} from "@shared/verticalDramaSeries/draftCompletion";
import { planVerticalDramaStoryArchitecture } from "./verticalDramaStoryArchitecturePlanner";
import type { AudienceAgeRating } from "@shared/verticalDramaSeries/audienceAgeRating";
import type { VerticalDramaStoryArchitectureContract } from "@shared/verticalDramaSeries/storyArchitecture";
import {
  assertVerticalDramaRecommendedDraftModel,
  resolveVerticalDramaRecommendedDraftModel,
} from "./verticalDramaLlmModelPolicy";
import {
  appendVerticalDramaDraftVersion,
  ensureVerticalDramaDraftJob,
  updateVerticalDramaDraftJob,
  type PersistVerticalDramaDraftVersion,
  type VerticalDramaDraftVersionRef,
  type VerticalDramaDraftJobPatch,
} from "./verticalDramaDraftLedger";

export const VERTICAL_DRAMA_DRAFT_COMPOSITION_QUEUE =
  "vertical_drama_draft_composition";
const JOB_TTL_SECONDS = 60 * 60;
const ACTIVE_POINTER_TTL_SECONDS = 60 * 60;
const MAX_PAYLOAD_BYTES = 180_000;
const MAX_REPAIR_ROUNDS = 2;

function normalizeAudienceAgeRating(
  value: VerticalDramaDraftCompositionSynthesisInput["audienceAgeRating"]
): AudienceAgeRating | undefined {
  return value === "18plus" || value === "13plus" || value === "under13"
    ? value
    : undefined;
}

export type VerticalDramaDraftCompositionStatus =
  | "queued"
  | "building_foundation"
  | "composing"
  | "completing"
  | "validating"
  | "ready_for_qc"
  | "failed"
  | "cancelled";

export type VerticalDramaDraftCompositionFailureCode =
  | "recommended_model_unavailable"
  | "llm_provider_error"
  | "llm_output_quality_insufficient"
  | "draft_completion_incomplete"
  | "internal_error";

export interface VerticalDramaDraftCompositionFailure {
  code: VerticalDramaDraftCompositionFailureCode;
  stage: Exclude<
    VerticalDramaDraftCompositionStatus,
    "queued" | "failed" | "cancelled" | "ready_for_qc"
  >;
  modelId?: string;
  /** The model was checked against the active LLM Recommend quality policy. */
  qualityGate: "llm-recommended-draft-quality" | "not-available";
  retryable: boolean;
  message: string;
  detail?: string;
  diagnostics?: string[];
}

export interface VerticalDramaDraftCompositionOwner {
  tenantId: string;
  userId: number;
}

export interface VerticalDramaDraftCompositionSynthesisInput {
  locale: "th" | "en";
  selectedPresets: Array<
    PresetSynthesisPresetInput | PresetSynthesisPresetInputV2
  >;
  selectedCategories: string[];
  primarySelectionId?: string;
  selections?: Array<{ presetId: string; weight: 1 | 2 | 3 | 4 | 5 }>;
  useV2: boolean;
  businessContext?: string;
  productContext?: string;
  targetEpisodeCount?: number;
  toneHint?: string;
  seriesTitleHint?: string;
  genreHint?: string;
  userPremise?: string;
  audienceAgeRating?: "under13" | "13plus" | "16plus" | "18plus";
  dialogueLanguageProfile?: Record<string, unknown>;
  lineageContext?: Record<string, unknown>;
  visualNarrativeEnabled?: boolean;
  visualNarrativeIdentity?: Record<string, unknown>;
  sourcePackDigest?: Record<string, unknown>;
  seriesProfileId?: string;
}

export interface VerticalDramaDraftCompositionPayload extends VerticalDramaDraftCompositionOwner {
  jobId: string;
  draftSessionId: string;
  /** Canonical Series owner for every new composition job. */
  seriesId: number;
  requestFingerprint: string;
  /** Snapshot of the server-approved LLM Recommend model used by every stage. */
  model?: string;
  /** Raw creator input snapshot. This is stored independently of feature flags. */
  requestJson?: Record<string, unknown>;
  synthesis: VerticalDramaDraftCompositionSynthesisInput;
}

export interface VerticalDramaDraftCompositionProgress {
  stage: Exclude<
    VerticalDramaDraftCompositionStatus,
    "queued" | "failed" | "cancelled"
  >;
  repairRound: number;
  maxRepairRounds: number;
  missingCount: number;
  contradictionCount: number;
}

export interface VerticalDramaDraftCompositionResult {
  draft: SynthesizedGenrePresetDraft;
  report: VerticalDramaDraftCompletionReport;
  model: string;
  creditsUsed: number;
  draftArtifactId: string;
  draftArtifact?: VerticalDramaDraftVersionRef;
}

export interface VerticalDramaDraftCompositionRecord extends VerticalDramaDraftCompositionPayload {
  status: VerticalDramaDraftCompositionStatus;
  progress: VerticalDramaDraftCompositionProgress | null;
  result: VerticalDramaDraftCompositionResult | null;
  error: string | null;
  failure?: VerticalDramaDraftCompositionFailure;
  createdAt: string;
  updatedAt: string;
}

export interface VerticalDramaDraftCompositionRedisAdapter {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    mode: "EX",
    seconds: number
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

interface JobDependencies {
  redis?: VerticalDramaDraftCompositionRedisAdapter;
  now?: () => number;
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
  persistVersion?: PersistVerticalDramaDraftVersion;
  persistJob?: typeof ensureVerticalDramaDraftJob;
  persistJobStatus?: (
    draftId: string,
    owner: VerticalDramaDraftCompositionOwner,
    patch: VerticalDramaDraftJobPatch
  ) => Promise<boolean>;
}

function defaultRedis(): VerticalDramaDraftCompositionRedisAdapter {
  const redis = getRedisClient();
  return {
    get: key => redis.get(key),
    set: (key, value, mode, seconds) => redis.set(key, value, mode, seconds),
    del: key => redis.del(key),
  };
}

function deps(input?: JobDependencies) {
  return { redis: input?.redis ?? defaultRedis(), now: input?.now ?? Date.now };
}

function recordKey(jobId: string): string {
  return `vd:draft-composition:${jobId}`;
}

function pointerKey(
  owner: VerticalDramaDraftCompositionOwner,
  sessionId: string,
  seriesId?: number
): string {
  return `vd:draft-composition:active:${owner.tenantId}:${owner.userId}:${seriesId ?? "legacy"}:${sessionId}`;
}

async function readRecord(
  jobId: string,
  input?: JobDependencies
): Promise<VerticalDramaDraftCompositionRecord | null> {
  const raw = await deps(input).redis.get(recordKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaDraftCompositionRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaDraftCompositionRecord,
  input?: JobDependencies
): Promise<void> {
  const { redis } = deps(input);
  await redis.set(
    recordKey(record.jobId),
    JSON.stringify(record),
    "EX",
    JOB_TTL_SECONDS
  );
  // Keep a short-lived pointer for terminal results too. A browser refresh can
  // lose the job id after the server has finished, while the creator is still
  // reviewing or waiting to start QC.
  if (record.status !== "cancelled") {
    await redis.set(
      pointerKey(record, record.draftSessionId, record.seriesId),
      record.jobId,
      "EX",
      ACTIVE_POINTER_TTL_SECONDS
    );
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function errorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 1000);
}

export function classifyVerticalDramaDraftCompositionFailure(params: {
  error: unknown;
  stage: VerticalDramaDraftCompositionFailure["stage"];
  modelId?: string;
}): VerticalDramaDraftCompositionFailure {
  const detail = errorDetail(params.error);
  const normalized = detail.toLowerCase();
  const qualityGate = params.modelId
    ? "llm-recommended-draft-quality"
    : "not-available";

  if (
    /no admin-recommended|not in the active llm recommend set/.test(normalized)
  ) {
    return {
      code: "recommended_model_unavailable",
      stage: params.stage,
      modelId: params.modelId,
      qualityGate: "not-available",
      retryable: false,
      message:
        "ไม่มี LLM ที่อยู่ในชุด LLM Recommend และผ่านเกณฑ์ Draft ในขณะนี้",
      detail,
    };
  }
  if (/no endpoints found|requested parameters/.test(normalized)) {
    return {
      code: "llm_provider_error",
      stage: params.stage,
      modelId: params.modelId,
      qualityGate,
      retryable: false,
      message:
        "Provider ของโมเดลที่เลือกไม่รองรับพารามิเตอร์ structured output ของ Draft ขณะนี้ กรุณาตรวจสอบ capability ของ provider แล้วลองใหม่",
      detail,
    };
  }
  if (
    /no healthy provider|timeout|timed out|network|upstream|rate limit|429|502|503|504|connection/.test(
      normalized
    )
  ) {
    return {
      code: "llm_provider_error",
      stage: params.stage,
      modelId: params.modelId,
      qualityGate,
      retryable: true,
      message: "บริการ LLM ขัดข้องหรือไม่ตอบกลับ จึงยังสร้าง Draft ไม่สำเร็จ",
      detail,
    };
  }
  if (/draft completion failed/.test(normalized)) {
    return {
      code: "draft_completion_incomplete",
      stage: params.stage,
      modelId: params.modelId,
      qualityGate,
      retryable: true,
      message:
        "LLM สร้างข้อมูลไม่ครบ แม้ผ่านรอบเติมข้อมูลแล้ว จึงไม่อนุญาตให้ส่ง Draft เข้า QC",
      detail,
    };
  }
  if (
    /story foundation is incomplete|schema|json|validation|unexpected token|invalid/.test(
      normalized
    )
  ) {
    return {
      code: "llm_output_quality_insufficient",
      stage: params.stage,
      modelId: params.modelId,
      qualityGate,
      retryable: true,
      message:
        "LLM ตอบข้อมูลไม่ครบหรือไม่ตรงโครงสร้าง Draft ที่ระบบกำหนด จึงไม่ผ่าน quality gate",
      detail,
    };
  }
  return {
    code: "internal_error",
    stage: params.stage,
    modelId: params.modelId,
    qualityGate,
    retryable: false,
    message: "ระบบสร้าง Draft หยุดทำงานจากข้อผิดพลาดที่ไม่ทราบประเภท",
    detail,
  };
}

export async function enqueueVerticalDramaDraftComposition(
  payload: Omit<
    VerticalDramaDraftCompositionPayload,
    "jobId" | "requestFingerprint"
  >,
  input: JobDependencies = {}
): Promise<{ jobId: string; deduped: boolean }> {
  if (!Number.isInteger(payload.seriesId) || payload.seriesId <= 0) {
    throw new Error("Draft composition requires an owning Series");
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_PAYLOAD_BYTES)
    throw new Error("Draft composition payload is too large");
  const runtime = deps(input);
  const active = pointerKey(payload, payload.draftSessionId, payload.seriesId);
  const existingId = await runtime.redis.get(active);
  const requestFingerprint = fingerprint(payload);
  if (existingId) {
    const existing = await readRecord(existingId, input);
    if (
      existing &&
      !["failed", "cancelled", "ready_for_qc"].includes(existing.status) &&
      existing.requestFingerprint === requestFingerprint
    )
      return { jobId: existingId, deduped: true };
    await runtime.redis.del(active);
  }
  const jobId = randomUUID();
  const now = new Date(runtime.now()).toISOString();
  const record: VerticalDramaDraftCompositionRecord = {
    ...payload,
    jobId,
    requestFingerprint,
    status: "queued",
    progress: null,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  if (input.persistJob) {
    await input.persistJob({
      ...payload,
      draftId: jobId,
      draftSessionId: payload.draftSessionId,
      stage: "foundation",
      content: {},
      jobId,
    });
  }
  await writeRecord(record, input);
  try {
    await (input.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(jobId);
  } catch (error) {
    await writeRecord(
      {
        ...record,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Draft composition queue unavailable",
        updatedAt: new Date().toISOString(),
      },
      input
    );
    if (input.persistJobStatus) {
      await input.persistJobStatus(jobId, payload, {
        jobStatus: "failed",
        compositionJobId: jobId,
        seriesId: payload.seriesId,
        lastError: record.error,
      });
    }
    await runtime.redis.del(active);
    throw new Error("Draft composition queue is unavailable; please retry");
  }
  return { jobId, deduped: false };
}

export async function getVerticalDramaDraftCompositionStatus(
  jobId: string,
  owner: VerticalDramaDraftCompositionOwner,
  seriesId?: number,
  input?: JobDependencies
): Promise<VerticalDramaDraftCompositionRecord | null> {
  const record = await readRecord(jobId, input);
  return record &&
    record.tenantId === owner.tenantId &&
    record.userId === owner.userId &&
    (seriesId === undefined || record.seriesId === seriesId)
    ? record
    : null;
}

export async function getVerticalDramaDraftCompositionStatusBySession(
  draftSessionId: string,
  owner: VerticalDramaDraftCompositionOwner,
  seriesId?: number,
  input?: JobDependencies
): Promise<VerticalDramaDraftCompositionRecord | null> {
  const jobId = await deps(input).redis.get(
    pointerKey(owner, draftSessionId, seriesId)
  );
  if (!jobId) return null;
  return getVerticalDramaDraftCompositionStatus(jobId, owner, seriesId, input);
}

/** Clear a stale Series-scoped pointer even when the Redis job record expired. */
export async function clearVerticalDramaDraftCompositionPointer(
  draftSessionId: string,
  owner: VerticalDramaDraftCompositionOwner,
  seriesId?: number,
  input?: JobDependencies
): Promise<void> {
  await deps(input).redis.del(pointerKey(owner, draftSessionId, seriesId));
}

export async function cancelVerticalDramaDraftComposition(
  jobId: string,
  owner: VerticalDramaDraftCompositionOwner,
  seriesId?: number,
  input?: JobDependencies
): Promise<boolean> {
  const runtime = deps(input);
  const record = await getVerticalDramaDraftCompositionStatus(
    jobId,
    owner,
    seriesId,
    input
  );
  if (!record) return false;
  if (["failed", "cancelled", "ready_for_qc"].includes(record.status))
    return true;
  await writeRecord(
    {
      ...record,
      status: "cancelled",
      error: "Cancelled by creator",
      updatedAt: new Date(runtime.now()).toISOString(),
    },
    input
  );
  await runtime.redis.del(
    pointerKey(record, record.draftSessionId, record.seriesId)
  );
  return true;
}

async function isCancelled(
  jobId: string,
  input?: JobDependencies
): Promise<boolean> {
  return (await readRecord(jobId, input))?.status === "cancelled";
}

async function progress(
  jobId: string,
  stage: VerticalDramaDraftCompositionProgress["stage"],
  repairRound: number,
  draft: Record<string, unknown>,
  input?: JobDependencies
): Promise<void> {
  const current = await readRecord(jobId, input);
  if (!current || current.status === "cancelled") return;
  const check = inspectVerticalDramaDraftCompleteness({
    draft,
    targetEpisodeCount: current.synthesis.targetEpisodeCount,
    genre: current.synthesis.genreHint,
    userPremise: current.synthesis.userPremise,
  });
  await writeRecord(
    {
      ...current,
      status: stage,
      progress: {
        stage,
        repairRound,
        maxRepairRounds: MAX_REPAIR_ROUNDS,
        missingCount: check.report.missingPaths.length,
        contradictionCount: check.report.contradictionPaths.length,
      },
      updatedAt: new Date().toISOString(),
    },
    input
  );
}

export async function runVerticalDramaDraftCompositionJob(
  jobId: string,
  input: JobDependencies = {}
): Promise<void> {
  const record = await readRecord(jobId, input);
  if (!record || record.status === "cancelled") return;
  const persistVersion =
    input.persistVersion ?? appendVerticalDramaDraftVersion;
  const persistJobStatus =
    input.persistJobStatus ?? updateVerticalDramaDraftJob;
  let latestArtifact: VerticalDramaDraftVersionRef | undefined;
  let currentStage: VerticalDramaDraftCompositionFailure["stage"] =
    "building_foundation";
  let selectedModel: string | undefined = record.model;
  let draft: SynthesizedGenrePresetDraft | undefined;
  let totalCredits = 0;
  try {
    let model =
      record.model ?? (await resolveVerticalDramaRecommendedDraftModel());
    selectedModel = model;
    await persistJobStatus(jobId, record, {
      jobStatus: "composing",
      compositionJobId: jobId,
      seriesId: record.seriesId,
      lastError: null,
    });
    await assertVerticalDramaRecommendedDraftModel(model);
    currentStage = "building_foundation";
    await progress(jobId, "building_foundation", 0, {}, input);
    const synthesis = record.synthesis;
    const foundation = await planVerticalDramaStoryArchitecture({
      userId: record.userId,
      model,
      locale: synthesis.locale,
      userPremise: synthesis.userPremise,
      genreHint: synthesis.genreHint,
      seriesTitleHint: synthesis.seriesTitleHint,
      toneHint: synthesis.toneHint,
      selectedCategories: synthesis.selectedCategories,
      selectedPresets: synthesis.selectedPresets.map(preset => ({
        id: preset.id,
        title: preset.title,
        category: preset.category,
        logline: preset.logline,
        mainPlot: preset.mainPlot,
        seasonArc: preset.seasonArc,
      })),
      targetEpisodeCount: synthesis.targetEpisodeCount,
      audienceAgeRating: normalizeAudienceAgeRating(
        synthesis.audienceAgeRating
      ),
      dialogueLanguageProfile: synthesis.dialogueLanguageProfile as any,
      lineageContext: synthesis.lineageContext as any,
    });
    if (!foundation.contract || foundation.diagnostics.length > 0) {
      throw new Error(
        `Story foundation is incomplete: ${foundation.diagnostics.map(item => item.code).join(", ")}`
      );
    }
    const storyArchitecture =
      foundation.contract as VerticalDramaStoryArchitectureContract;
    if (foundation.model !== model) {
      model = foundation.model;
      selectedModel = model;
    }
    latestArtifact = await persistVersion({
      tenantId: record.tenantId,
      userId: record.userId,
      draftId: record.jobId,
      draftSessionId: record.draftSessionId,
      seriesId: record.seriesId,
      stage: "foundation",
      content: { storyArchitecture },
      jobId: record.jobId,
      changedPaths: ["storyArchitecture"],
      metadata: { model: foundation.model },
    });
    const foundationCredits = calculateCreditsForLLM(
      foundation.promptTokens,
      foundation.completionTokens,
      foundation.model
    );
    if (foundationCredits > 0) {
      await deductCredits({
        userId: record.userId,
        tenantId: record.tenantId,
        amount: foundationCredits,
        description: "Vertical Drama - build transient story foundation",
        skillSlug: "vertical-drama-deep-story-draft",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_draft_composition",
          stage: "foundation",
          model: foundation.model,
        },
      });
    }
    const commonSynthesisParams = {
      userId: record.userId,
      model,
      tenantId: record.tenantId,
      locale: synthesis.locale,
      selectedCategories: synthesis.selectedCategories,
      primarySelectionId: synthesis.primarySelectionId,
      businessContext: synthesis.businessContext,
      productContext: synthesis.productContext,
      targetEpisodeCount: synthesis.targetEpisodeCount,
      toneHint: synthesis.toneHint,
      seriesTitleHint: synthesis.seriesTitleHint,
      genreHint: synthesis.genreHint,
      audienceAgeRating: normalizeAudienceAgeRating(
        synthesis.audienceAgeRating
      ),
      userPremise: synthesis.userPremise,
      dialogueLanguageProfile: synthesis.dialogueLanguageProfile as any,
      lineageContext: synthesis.lineageContext as any,
      visualNarrativeEnabled: synthesis.visualNarrativeEnabled,
      visualNarrativeIdentity: synthesis.visualNarrativeIdentity as any,
      sourcePackDigest: synthesis.sourcePackDigest,
      seriesProfileId: synthesis.seriesProfileId,
      storyArchitecture,
    };
    currentStage = "composing";
    const result = synthesis.useV2
      ? await synthesizeVerticalDramaPresetV2({
          ...commonSynthesisParams,
          selections: synthesis.selections,
          selectedPresetIds: synthesis.selectedPresets.map(preset => preset.id),
          selectedPresets:
            synthesis.selectedPresets as PresetSynthesisPresetInputV2[],
        })
      : await synthesizeVerticalDramaPreset({
          ...commonSynthesisParams,
          selectedPresets:
            synthesis.selectedPresets as PresetSynthesisPresetInput[],
        });
    draft = result.draft as SynthesizedGenrePresetDraft;
    totalCredits = foundationCredits + result.creditsUsed;
    // The shared planning wrapper may rotate away from a temporarily
    // unavailable model into an admin-recommended healthy model. Carry that
    // effective model forward so completion/QC never jumps back to the failed
    // selection mid-job.
    if (result.model !== model) {
      model = result.model;
      selectedModel = model;
    }
    latestArtifact = await persistVersion({
      tenantId: record.tenantId,
      userId: record.userId,
      draftId: record.jobId,
      draftSessionId: record.draftSessionId,
      seriesId: record.seriesId,
      stage: "compose",
      content: draft as unknown as Record<string, unknown>,
      jobId: record.jobId,
      changedPaths: Object.keys(draft as unknown as Record<string, unknown>),
      metadata: { model: result.model },
    });
    for (let repairRound = 0; repairRound <= MAX_REPAIR_ROUNDS; repairRound++) {
      if (await isCancelled(jobId, input)) return;
      currentStage = repairRound === 0 ? "composing" : "completing";
      await progress(
        jobId,
        repairRound === 0 ? "composing" : "completing",
        repairRound,
        draft as Record<string, unknown>,
        input
      );
      const check = inspectVerticalDramaDraftCompleteness({
        draft: draft as Record<string, unknown>,
        targetEpisodeCount: synthesis.targetEpisodeCount,
        genre: synthesis.genreHint,
        userPremise: synthesis.userPremise,
      });
      if (check.ready) {
        currentStage = "validating";
        const finalReport = verticalDramaDraftCompletionReportSchema.parse({
          ...check.report,
          repairRound,
          fingerprint: fingerprint(draft),
        });
        latestArtifact = await persistVersion({
          tenantId: record.tenantId,
          userId: record.userId,
          draftId: record.jobId,
          draftSessionId: record.draftSessionId,
          seriesId: record.seriesId,
          stage: "validation",
          content: draft as unknown as Record<string, unknown>,
          jobId: record.jobId,
          changedPaths: ["draftCompletenessReport"],
          metadata: { repairRound, report: finalReport },
        });
        const latest = await readRecord(jobId, input);
        if (!latest || latest.status === "cancelled") return;
        await writeRecord(
          {
            ...latest,
            status: "ready_for_qc",
            progress: {
              stage: "ready_for_qc",
              repairRound,
              maxRepairRounds: MAX_REPAIR_ROUNDS,
              missingCount: 0,
              contradictionCount: 0,
            },
            result: {
              draft,
              report: finalReport,
              model,
              creditsUsed: totalCredits,
              draftArtifactId: record.jobId,
              draftArtifact: latestArtifact,
            },
            updatedAt: new Date().toISOString(),
          },
          input
        );
        await persistJobStatus(jobId, record, {
          jobStatus: "ready_for_qc",
          compositionJobId: jobId,
          seriesId: record.seriesId,
          lastError: null,
        });
        return;
      }
      if (repairRound === MAX_REPAIR_ROUNDS)
        throw new Error(
          `Draft completion failed: ${check.report.missingPaths.slice(0, 8).join(", ")}`
        );
      const completed = await completeVerticalDramaDraft({
        draft,
        model,
        context: {
          locale: synthesis.locale,
          targetEpisodeCount: synthesis.targetEpisodeCount,
          genre: synthesis.genreHint,
          userPremise: synthesis.userPremise,
          storyArchitecture,
        },
        repairRound: repairRound + 1,
        userId: record.userId,
      });
      await deductVerticalDramaDraftCompletionCredits({
        userId: record.userId,
        tenantId: record.tenantId,
        creditsUsed: completed.creditsUsed,
        model: completed.model,
        repairRound: repairRound + 1,
      });
      draft = completed.draft;
      latestArtifact = await persistVersion({
        tenantId: record.tenantId,
        userId: record.userId,
        draftId: record.jobId,
        draftSessionId: record.draftSessionId,
        seriesId: record.seriesId,
        stage: "completion",
        content: draft as unknown as Record<string, unknown>,
        jobId: record.jobId,
        changedPaths: [
          ...check.report.missingPaths,
          ...check.report.contradictionPaths,
        ],
        metadata: { repairRound: repairRound + 1, model: completed.model },
      });
      totalCredits += completed.creditsUsed;
      if (completed.model !== model) {
        model = completed.model;
        selectedModel = model;
      }
    }
  } catch (error) {
    const latest = await readRecord(jobId, input);
    if (!latest || latest.status === "cancelled") return;
    const failure = classifyVerticalDramaDraftCompositionFailure({
      error,
      stage: currentStage,
      modelId: selectedModel,
    });
    let partialResult: VerticalDramaDraftCompositionResult | undefined;
    if (draft) {
      const synthesis = latest.synthesis;
      const partialCheck = inspectVerticalDramaDraftCompleteness({
        draft: draft as Record<string, unknown>,
        targetEpisodeCount: synthesis.targetEpisodeCount,
        genre: synthesis.genreHint,
        userPremise: synthesis.userPremise,
      });
      const partialReport = verticalDramaDraftCompletionReportSchema.parse({
        ...partialCheck.report,
        repairRound: MAX_REPAIR_ROUNDS,
        stage: currentStage,
        fingerprint: fingerprint(draft),
      });
      partialResult = {
        draft,
        report: partialReport,
        model: selectedModel ?? "unknown",
        creditsUsed: totalCredits,
        draftArtifactId: latest.jobId,
        draftArtifact: latestArtifact,
      };
    }
    await writeRecord(
      {
        ...latest,
        status: "failed",
        result: partialResult ?? latest.result,
        error: failure.message,
        failure,
        updatedAt: new Date().toISOString(),
      },
      input
    );
    await persistJobStatus(jobId, record, {
      jobStatus: "failed",
      compositionJobId: jobId,
      seriesId: record.seriesId,
      lastError: failure.message,
    });
  }
}

let queue: any = null;
let worker: any = null;
async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) throw new Error("Draft composition queue is not initialized");
  await queue.add(
    "run",
    { jobId },
    { attempts: 1, removeOnComplete: true, removeOnFail: { age: 24 * 60 * 60 } }
  );
}

export async function initVerticalDramaDraftCompositionQueue(): Promise<void> {
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_DRAFT_COMPOSITION_QUEUE, { connection });
    worker = new Worker(
      VERTICAL_DRAMA_DRAFT_COMPOSITION_QUEUE,
      async (job: any) =>
        runVerticalDramaDraftCompositionJob(job.data.jobId, {
          persistJobStatus: updateVerticalDramaDraftJob,
        }),
      { connection, concurrency: 2 }
    );
    worker.on("failed", (job: any, error: Error) =>
      console.error(
        `[${VERTICAL_DRAMA_DRAFT_COMPOSITION_QUEUE}] job ${job?.id} failed`,
        error.message
      )
    );
  } catch (error) {
    console.warn(
      `[${VERTICAL_DRAMA_DRAFT_COMPOSITION_QUEUE}] initialization skipped`,
      error instanceof Error ? error.message : error
    );
  }
}

export async function closeVerticalDramaDraftCompositionQueue(): Promise<void> {
  try {
    await worker?.close();
    await queue?.close();
  } finally {
    queue = null;
    worker = null;
  }
}
