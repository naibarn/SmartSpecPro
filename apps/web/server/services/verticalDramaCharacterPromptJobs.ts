/** Durable submit -> poll orchestration for Vertical Drama character prompts.
 * `worker_jobs` is the lifecycle and result authority; this module only adapts
 * its canonical snapshots to the existing owner-scoped UI contract.
 */
import { randomUUID } from "node:crypto";
import { debugError } from "../_core/logger";
import { createJobControlPlane } from "./jobControlPlane";
import { createFeature186VerticalDramaJobRef } from "./feature186VerticalDramaJobAdapter";

export const VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE =
  "vertical_drama_character_prompt_jobs";

export type VerticalDramaCharacterPromptJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type VerticalDramaCharacterPromptJobWaitingReason =
  | "provider_capacity";

export interface VerticalDramaCharacterPromptJobInput {
  seriesId: string;
  characterId: string;
  selectedImageModelId?: string;
  portraitCandidateCount?: number;
  replacePortraitCandidateAssetLinkId?: string;
  customInstruction?: string;
  castingReferenceAssetLinkIds?: string[];
  castingLockClothing?: boolean;
  castingPoseMode?: "auto_natural" | "lock_reference";
  castingCameraFraming?:
    | "full_body"
    | "three_quarter"
    | "half_body"
    | "medium_close_up"
    | "close_up"
    | "extreme_close_up"
    | "wide_environmental";
}

export interface VerticalDramaCharacterPromptJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  characterId: number;
}

export interface VerticalDramaCharacterPromptJobPayload
  extends VerticalDramaCharacterPromptJobOwner {
  publicUrl: string | null;
  input: VerticalDramaCharacterPromptJobInput;
}

export interface VerticalDramaCharacterPromptJobRecord
  extends VerticalDramaCharacterPromptJobPayload {
  jobId: string;
  status: VerticalDramaCharacterPromptJobStatus;
  result: unknown | null;
  error: string | null;
  capacityRetryCount?: number;
  waitingReason?: VerticalDramaCharacterPromptJobWaitingReason;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type VerticalDramaCharacterPromptJobExecutor = (
  payload: VerticalDramaCharacterPromptJobPayload,
  execution: { jobId: string; token: string }
) => Promise<unknown>;

const activeWorkerExecutions = new Map<string, string>();

export function isVerticalDramaCharacterPromptWorkerExecution(
  jobId: string,
  token: string
): boolean {
  return activeWorkerExecutions.get(jobId) === token;
}

function activeDedupeKey(owner: VerticalDramaCharacterPromptJobOwner): string {
  return [
    "vd:character-prompt-job:active",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.characterId,
  ].join(":");
}

function canonicalStatus(status: string): VerticalDramaCharacterPromptJobStatus {
  if (status === "succeeded") return "succeeded";
  if (["failed", "cancelled", "expired"].includes(status)) return "failed";
  return ["running", "waiting_external"].includes(status) ? "running" : "queued";
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Character prompt preview failed").slice(0, 2_000);
}

/** True only for the provider's temporary in-flight credit-capacity error. */
export function isVerticalDramaCharacterPromptCreditCapacityError(
  error: unknown
): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ");
  return (
    message.includes("would exceed your available credits") &&
    message.includes("in-flight")
  );
}

function snapshotRecord(
  snapshot: Awaited<ReturnType<ReturnType<typeof createJobControlPlane>["getJobSnapshot"]>>,
  owner: VerticalDramaCharacterPromptJobOwner
): VerticalDramaCharacterPromptJobRecord | null {
  if (!snapshot || snapshot.jobType !== "vertical_drama.character_prompt") {
    return null;
  }
  const input = snapshot.input;
  const payloadInput = input.input;
  if (
    input.tenantId !== owner.tenantId ||
    Number(input.userId) !== owner.userId ||
    Number(input.seriesId) !== owner.seriesId ||
    Number(input.characterId) !== owner.characterId ||
    !payloadInput || typeof payloadInput !== "object" || Array.isArray(payloadInput)
  ) {
    return null;
  }

  const output = snapshot.output;
  const result = output && typeof output === "object" && "output" in output
    ? output.output
    : output && typeof output === "object" && "result" in output
      ? output.result
      : output;
  const retryCount = Number(snapshot.progress.capacityRetryCount ?? 0);
  return {
    jobId: snapshot.jobId,
    tenantId: owner.tenantId,
    userId: owner.userId,
    seriesId: owner.seriesId,
    characterId: owner.characterId,
    publicUrl: typeof input.publicUrl === "string" ? input.publicUrl : null,
    input: payloadInput as VerticalDramaCharacterPromptJobInput,
    status: canonicalStatus(snapshot.status),
    result: result ?? null,
    error: snapshot.errorMessage ? boundedError(snapshot.errorMessage) : null,
    ...(Number.isFinite(retryCount) && retryCount > 0
      ? { capacityRetryCount: retryCount, waitingReason: "provider_capacity" as const }
      : {}),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

export async function getVerticalDramaCharacterPromptJobStatus(
  jobId: string,
  owner: VerticalDramaCharacterPromptJobOwner
): Promise<VerticalDramaCharacterPromptJobRecord | null> {
  const snapshot = await createJobControlPlane().getJobSnapshot(jobId, {
    tenantId: owner.tenantId,
    requestedByUserId: owner.userId,
  }).catch(() => null);
  return snapshotRecord(snapshot, owner);
}

export async function getActiveVerticalDramaCharacterPromptJob(
  owner: VerticalDramaCharacterPromptJobOwner
): Promise<VerticalDramaCharacterPromptJobRecord | null> {
  const snapshot = await createJobControlPlane().getActiveJobByDedupeKey({
    tenantId: owner.tenantId,
    requestedByUserId: owner.userId,
    activeDedupeKey: activeDedupeKey(owner),
  }).catch(() => null);
  return snapshotRecord(snapshot, owner);
}

export async function enqueueVerticalDramaCharacterPromptJob(
  payload: VerticalDramaCharacterPromptJobPayload
): Promise<{
  jobId: string;
  status: VerticalDramaCharacterPromptJobStatus;
  deduped: boolean;
}> {
  const jobId = randomUUID();
  const record: VerticalDramaCharacterPromptJobRecord = {
    ...payload,
    jobId,
    status: "queued",
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const admitted = await createFeature186VerticalDramaJobRef({
      jobId,
      tenantId: payload.tenantId,
      userId: payload.userId,
      jobType: "vertical_drama.character_prompt",
      executionClass: "long",
      activeDedupeKey: activeDedupeKey(payload),
      payload: record as unknown as Record<string, unknown>,
    });
    const existing = admitted.created
      ? null
      : await getVerticalDramaCharacterPromptJobStatus(admitted.jobId, payload);
    return {
      jobId: admitted.jobId,
      status: existing?.status ?? "queued",
      deduped: !admitted.created,
    };
  } catch (error) {
    debugError(
      "verticalDramaCharacterPromptJobs",
      `Failed to admit character prompt job ${jobId}`,
      error
    );
    throw new Error(`VD_CHARACTER_PROMPT_ADMISSION_FAILED: ${boundedError(error)}`);
  }
}

/** Execute under the canonical worker lease. Status/result settlement belongs
 * to the worker_jobs control plane after this promise resolves or rejects.
 */
export async function runVerticalDramaCharacterPromptJob(
  jobId: string,
  executor: VerticalDramaCharacterPromptJobExecutor
): Promise<unknown> {
  const controlPlane = createJobControlPlane();
  const snapshot = await controlPlane.getJobSnapshot(jobId).catch(() => null);
  if (!snapshot || snapshot.jobType !== "vertical_drama.character_prompt") {
    throw new Error("VD_CHARACTER_PROMPT_JOB_NOT_FOUND");
  }
  if (["succeeded", "failed", "cancelled", "expired"].includes(snapshot.status)) {
    throw new Error(`VD_CHARACTER_PROMPT_JOB_NOT_ACTIVE:${snapshot.status}`);
  }

  const input = snapshot.input;
  const payloadInput = input.input;
  if (
    typeof input.tenantId !== "string" ||
    !Number.isSafeInteger(Number(input.userId)) ||
    !Number.isSafeInteger(Number(input.seriesId)) ||
    !Number.isSafeInteger(Number(input.characterId)) ||
    !payloadInput || typeof payloadInput !== "object" || Array.isArray(payloadInput)
  ) {
    throw new Error("VD_CHARACTER_PROMPT_JOB_INPUT_INVALID");
  }
  const payload: VerticalDramaCharacterPromptJobPayload = {
    tenantId: input.tenantId,
    userId: Number(input.userId),
    seriesId: Number(input.seriesId),
    characterId: Number(input.characterId),
    publicUrl: typeof input.publicUrl === "string" ? input.publicUrl : null,
    input: payloadInput as VerticalDramaCharacterPromptJobInput,
  };

  const token = randomUUID();
  activeWorkerExecutions.set(jobId, token);
  try {
    return await executor(payload, { jobId, token });
  } catch (error) {
    if (isVerticalDramaCharacterPromptCreditCapacityError(error)) {
      const retryable = new Error(boundedError(error)) as Error & {
        class: "retryable";
        code: string;
      };
      retryable.class = "retryable";
      retryable.code = "PROVIDER_CAPACITY_RETRYABLE";
      throw retryable;
    }
    throw error;
  } finally {
    activeWorkerExecutions.delete(jobId);
  }
}

export async function initVerticalDramaCharacterPromptJobsQueue(): Promise<void> {
  // Execution and recovery are owned by the canonical worker_jobs control plane.
}

export async function closeVerticalDramaCharacterPromptJobsQueue(): Promise<void> {
  // Execution and recovery are owned by the canonical worker_jobs control plane.
}
