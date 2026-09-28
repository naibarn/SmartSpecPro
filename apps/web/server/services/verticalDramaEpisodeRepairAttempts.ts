import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodeRepairAttempts,
  type VerticalDramaEpisodeRepairAttemptRow,
} from "../../drizzle/schema";
import type { JsonPlanningAttemptEvent } from "./verticalDramaStoryBible";

const MAX_RAW_OUTPUT_CHARS = 80_000;
const MAX_JSON_CHARS = 120_000;

function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|token|secret)\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=[REDACTED]");
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return redactSecrets(value.slice(0, max));
}

function boundedJson(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_JSON_CHARS) return value;
    return {
      truncated: true,
      sha256: createHash("sha256").update(serialized).digest("hex"),
      chars: serialized.length,
    };
  } catch {
    return { unavailable: true };
  }
}

function normalizeError(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return redactSecrets(value).slice(0, 2000);
}

export type RecordEpisodeRepairAttemptInput = {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  revisionId: number;
  jobId?: string | null;
  attemptNumber: number;
  stage: "script" | "storyboard";
  skillSlug: string;
  event: JsonPlanningAttemptEvent;
  safetyFindings?: unknown;
};

/**
 * Persist forensic evidence for one logical skill call. This is deliberately
 * best-effort at the caller boundary: an audit-table outage must not turn a
 * valid paid generation into a failed repair.
 */
export async function recordVerticalDramaEpisodeRepairAttempt(
  input: RecordEpisodeRepairAttemptInput,
): Promise<number | null> {
  const rawOriginal = input.event.rawOutput ?? null;
  const rawOutput = boundedText(rawOriginal, MAX_RAW_OUTPUT_CHARS);
  const rawOutputHash = rawOriginal
    ? createHash("sha256").update(rawOriginal).digest("hex")
    : null;
  const [row] = await db
    .insert(verticalDramaEpisodeRepairAttempts)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      revisionId: input.revisionId,
      jobId: input.jobId ?? null,
      attemptNumber: input.attemptNumber,
      stage: input.stage,
      skillSlug: input.skillSlug,
      planningAttemptNumber: input.event.planningAttemptNumber,
      model: input.event.model,
      providerId: input.event.providerId,
      providerName: input.event.providerName,
      providerCallId: input.event.providerCallId,
      outcome: input.event.phase,
      rawOutput,
      rawOutputHash,
      rawOutputTruncated: Boolean(rawOriginal && rawOriginal.length > MAX_RAW_OUTPUT_CHARS),
      parsedOutput: boundedJson(input.event.parsedOutput),
      responseMetadata: boundedJson(input.event.responseMetadata),
      physicalAttempts: boundedJson(input.event.physicalAttempts),
      promptHash: input.event.promptHash,
      systemPromptLength: input.event.systemPromptLength,
      userPromptLength: input.event.userPromptLength,
      inputTokens: input.event.inputTokens ?? null,
      outputTokens: input.event.outputTokens ?? null,
      finishReason: input.event.finishReason ?? null,
      errorCode: input.event.errorCode ?? null,
      errorMessage: normalizeError(input.event.errorMessage),
      safetyFindings: boundedJson(input.safetyFindings),
      schemaIssues: boundedJson(input.event.schemaIssues),
      startedAt: input.event.startedAt,
      completedAt: input.event.completedAt,
    })
    .returning({ id: verticalDramaEpisodeRepairAttempts.id });
  return row?.id ?? null;
}

export async function listVerticalDramaEpisodeRepairAttempts(input: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  revisionId?: number;
  limit: number;
}): Promise<VerticalDramaEpisodeRepairAttemptRow[]> {
  return db
    .select()
    .from(verticalDramaEpisodeRepairAttempts)
    .where(
      and(
        eq(verticalDramaEpisodeRepairAttempts.tenantId, input.tenantId),
        eq(verticalDramaEpisodeRepairAttempts.userId, input.userId),
        eq(verticalDramaEpisodeRepairAttempts.seriesId, input.seriesId),
        eq(verticalDramaEpisodeRepairAttempts.episodeId, input.episodeId),
        ...(input.revisionId
          ? [eq(verticalDramaEpisodeRepairAttempts.revisionId, input.revisionId)]
          : []),
      ),
    )
    .orderBy(asc(verticalDramaEpisodeRepairAttempts.createdAt))
    .limit(input.limit);
}
