import { z } from "zod";
import { CREATE_SERIES_FIELD_LIMITS } from "./createSeriesFieldLimits";

/**
 * Compact, canonical planning projection stored on the Series row. Draft/QC
 * ledgers remain the immutable history; this shape is deliberately metadata
 * only so reopening a Series never requires loading old candidate bodies.
 */
export const verticalDramaActiveDraftSnapshotSchema = z.object({
  draftId: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  confirmedAt: z.string().datetime().optional(),
});

export const verticalDramaActiveQcSnapshotSchema = z.object({
  runId: z.string().uuid().optional(),
  score: z.number().min(0).max(10).optional(),
  status: z.string().max(32).optional(),
  confirmedAt: z.string().datetime().optional(),
});

/** Metadata-only pointer used when an old pre-Series Draft is reconciled into
 * the Series-first Planning workspace. It intentionally contains no Draft or
 * QC body; those remain lazy, explicit recovery reads. */
export const verticalDramaLegacyDraftRecoverySchema = z.object({
  draftId: z.string().uuid(),
  draftSessionId: z.string().trim().min(1).max(128),
  status: z.string().trim().min(1).max(32),
  qcRunId: z.string().uuid().nullable().optional(),
  currentVersion: z.number().int().nonnegative().optional(),
  migratedAt: z.string().datetime(),
});

/**
 * Lightweight identity for the staged Story Sources pack used by the
 * Series-first Planning workspace. The pack body and its assets stay in the
 * source-pack tables; only this pointer is kept on the Series so remounting a
 * tab does not create a new default pack or reload Draft/QC history.
 */
export const verticalDramaSourcePackPointerSchema = z.object({
  sourcePackId: z.number().int().positive().optional(),
  draftSessionId: z.string().trim().min(1).max(128).optional(),
  profileId: z.string().trim().min(1).max(80).optional(),
  savedAt: z.string().datetime(),
});

export const verticalDramaPlanningStateSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  status: z.enum(["planning", "draft_ready", "confirmed", "production_ready"]),
  activeStep: z.string().max(64).optional(),
  activeDraft: verticalDramaActiveDraftSnapshotSchema.nullable().optional(),
  activeQc: verticalDramaActiveQcSnapshotSchema.nullable().optional(),
  draftSessionId: z.string().trim().min(1).max(128).optional(),
  /** Last creator-authored premise in the planning form. This is a recovery
   * snapshot only; generated Draft/QC bodies remain in their ledgers. */
  userPremise: z
    .string()
    .max(CREATE_SERIES_FIELD_LIMITS.userPremise)
    .optional(),
  lastSavedAt: z.string().datetime(),
  finalizedDraftSessionId: z.string().trim().min(1).max(128).optional(),
  legacyRecovery: verticalDramaLegacyDraftRecoverySchema.nullable().optional(),
  sourcePackPointer: verticalDramaSourcePackPointerSchema.nullable().optional(),
});

export type VerticalDramaPlanningState = z.infer<
  typeof verticalDramaPlanningStateSchema
>;

export function readVerticalDramaPlanningState(
  bible: unknown
): VerticalDramaPlanningState | null {
  if (!bible || typeof bible !== "object" || Array.isArray(bible)) {
    return null;
  }
  const value = (bible as Record<string, unknown>).planningState;
  const parsed = verticalDramaPlanningStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function buildVerticalDramaPlanningState(params: {
  now?: string;
  status?: VerticalDramaPlanningState["status"];
  revision?: number;
  activeStep?: string;
  draftSessionId?: string;
}): VerticalDramaPlanningState {
  return {
    version: 1,
    revision: params.revision ?? 0,
    status: params.status ?? "planning",
    ...(params.activeStep ? { activeStep: params.activeStep } : {}),
    ...(params.draftSessionId ? { draftSessionId: params.draftSessionId } : {}),
    lastSavedAt: params.now ?? new Date().toISOString(),
  };
}
