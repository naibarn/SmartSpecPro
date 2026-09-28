import {
  CREDIT_TRANSACTION_SOURCE_TYPES,
  type CreditTransactionSourceType,
} from "./creditTransactionSource";

export const CREDIT_CONTEXT_TYPES = [
  "series",
  "job",
  "task",
  "run",
  "skill_execution",
  "conversation",
  "workflow",
  "media_task",
  "worker_job",
] as const;
export type CreditContextType = (typeof CREDIT_CONTEXT_TYPES)[number];

export const CREDIT_CONTEXT_SOURCE_TYPES = [
  "vertical_drama_series",
  "vertical_drama_job",
  "vertical_drama_task",
  "vertical_drama_run",
  "vertical_drama_episode_run",
  "vertical_drama_story_generation_run",
  "skill_execution",
  "conversation",
  "media_task",
  "worker_job",
  "api_job",
  "workflow_execution",
] as const;
export type CreditContextSourceType =
  (typeof CREDIT_CONTEXT_SOURCE_TYPES)[number];

export const CREDIT_CONTEXT_RESOLUTION_STATES = [
  "resolved",
  "historical_resolved",
  "archived",
  "partial",
  "unresolved",
  "ambiguous",
] as const;
export type CreditContextResolutionState =
  (typeof CREDIT_CONTEXT_RESOLUTION_STATES)[number];

export const CREDIT_CONTEXT_ATTRIBUTION_STATES = [
  "linked",
  "partial",
  "unattributed",
  "ambiguous",
] as const;
export type CreditContextAttributionStatus =
  (typeof CREDIT_CONTEXT_ATTRIBUTION_STATES)[number];

export const CREDIT_CONTEXT_LINK_ROLES = [
  "primary_work",
  "root_work",
  "parent_work",
  "execution",
  "conversation",
  "revenue_distribution",
  "reversal",
  "work_adjustment",
] as const;
export type CreditContextLinkRole =
  (typeof CREDIT_CONTEXT_LINK_ROLES)[number];

export const CREDIT_CONTEXT_PROVENANCE = [
  "new_explicit",
  "new_metadata",
  "historical_verified",
  "manual_review",
] as const;
export type CreditContextProvenance =
  (typeof CREDIT_CONTEXT_PROVENANCE)[number];

export type PersistedCreditSourceType = CreditTransactionSourceType;

/**
 * Product-facing cost estimate used by the Drama Series usage summary.
 * This is an estimate of platform credits, not a provider invoice amount.
 */
export const CREDITS_PER_USD = 1_000;

export function creditsToUsdEstimate(credits: number): number {
  return credits / CREDITS_PER_USD;
}

export interface CreditContextRef {
  contextType: CreditContextType;
  sourceType: CreditContextSourceType;
  sourceId: string | number;
  parent?: CreditContextRef;
  displayNameHint?: string | null;
  sourceRevision?: string | null;
  stageLabel?: string | null;
  attemptKey?: string | null;
}

export interface CreditContextScope {
  tenantId: string;
  userId: number;
  actorId?: number | null;
  traceId?: string | null;
}

export interface CreditContextSnapshot {
  label?: string;
  typeLabel?: string;
  stageLabel?: string;
  sourceRevision?: string;
  sourceId?: string;
}

export interface ResolvedCreditContext {
  ref: CreditContextRef;
  tenantId: string;
  ownerUserId: number | null;
  contextKey: string;
  displayName: string | null;
  displayType: string | null;
  snapshot: CreditContextSnapshot | null;
  resolutionState: CreditContextResolutionState;
  attributionStatus: CreditContextAttributionStatus;
  root?: ResolvedCreditContext;
  parent?: ResolvedCreditContext;
  resolverVersion: string;
}

export interface CreditContextPresentation {
  status: CreditContextAttributionStatus;
  primaryLabel: string | null;
  rootLabel: string | null;
  workTypeLabel: string | null;
  stageLabel: string | null;
  technicalRefsAvailable: boolean;
  primaryContextId?: string | null;
  rootContextId?: string | null;
}

export interface CreditContextReportFilters {
  startDate?: Date;
  endDate?: Date;
  contextType?: CreditContextType;
  rootContextId?: string;
  transactionSourceType?: PersistedCreditSourceType;
  contextSourceType?: CreditContextSourceType;
  skillSlug?: string;
  includeUnattributed?: boolean;
  asOfTransactionId?: number;
  limit?: number;
  offset?: number;
  /** Internal compatibility filter for historical rows that only retained seriesId metadata. */
  metadataSeriesId?: string;
}

export type CreditContextReportErrorCode =
  | "INVALID_DATE_RANGE"
  | "CONTEXT_NOT_FOUND"
  | "CONTEXT_UNAUTHORIZED"
  | "IDEMPOTENCY_CONFLICT"
  | "TENANT_SCOPE_REQUIRED"
  | "EXPORT_RANGE_EXCEEDED"
  | "REPORT_UNAVAILABLE";

export class CreditContextError extends Error {
  constructor(
    public readonly code: CreditContextReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreditContextError";
  }
}

const ALIAS_TO_PERSISTED: Record<string, PersistedCreditSourceType> = {
  vision_analysis: "other",
  embedding_generation: "other",
  reference_resolution: "other",
};

const PERSISTED_SOURCE_SET = new Set<string>(CREDIT_TRANSACTION_SOURCE_TYPES);
const CONTEXT_SOURCE_SET = new Set<string>(CREDIT_CONTEXT_SOURCE_TYPES);

export function normalizePersistedCreditSourceType(
  value: unknown,
): PersistedCreditSourceType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (PERSISTED_SOURCE_SET.has(normalized)) {
    return normalized as PersistedCreditSourceType;
  }
  return ALIAS_TO_PERSISTED[normalized] ?? null;
}

export function isPersistedCreditSourceType(
  value: unknown,
): value is PersistedCreditSourceType {
  return typeof value === "string" && PERSISTED_SOURCE_SET.has(value);
}

export function isCreditContextSourceType(
  value: unknown,
): value is CreditContextSourceType {
  return typeof value === "string" && CONTEXT_SOURCE_SET.has(value);
}

export function normalizeContextSourceId(value: string | number): string {
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 191 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CreditContextError("CONTEXT_NOT_FOUND", "Invalid credit context reference");
  }
  return normalized;
}

export function mapResolutionToPresentation(
  state: CreditContextResolutionState,
): CreditContextAttributionStatus {
  if (state === "partial") return "partial";
  if (state === "ambiguous") return "ambiguous";
  if (state === "resolved" || state === "historical_resolved" || state === "archived") {
    return "linked";
  }
  return "unattributed";
}

export const CREDIT_CONTEXT_RESOLVER_VERSION = "1";
export const CREDIT_CONTEXT_MAX_SNAPSHOT_BYTES = 4096;
export const CREDIT_CONTEXT_MAX_ANCESTRY_DEPTH = 8;
