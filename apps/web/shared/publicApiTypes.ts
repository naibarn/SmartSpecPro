/**
 * Public API shared types, constants, and scope definitions.
 * Used across sections 01-13 of the Public API & External Agent Gateway feature.
 */

/** All valid API scopes that can be assigned to an API key. */
export const ALLOWED_API_SCOPES = [
  "skills:list",
  "skills:execute",
  "agencies:list",
  "agencies:invoke",
  "presentations:create",
  "video_projects:create",
  "media:generate",
  "llm:chat",
  "mcp:read",
  "mcp:write",
  "jobs:create",
  "jobs:read",
  "jobs:write",
  "webhooks:manage",
  "events:read",
  "api_keys:manage",
] as const;

export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];

/** Set version for fast O(1) lookups. */
export const ALLOWED_API_SCOPES_SET: ReadonlySet<string> = new Set(ALLOWED_API_SCOPES);

/** Authentication context populated by API key middleware. */
export interface AuthContext {
  userId: number;
  tenantId: string; // varchar(36) -- NOT integer
  mode: "session" | "api_key";
  apiKeyId?: string;
  scopes?: string[];
  /** Per-key rate limit in requests-per-minute. Populated for api_key mode only. */
  rateLimit?: number;
  /** Per-key daily credit cap. null = unlimited. Populated for api_key mode only. */
  creditLimit?: number | null;
  /** Per-key request quotas. null = unlimited. Populated for api_key mode only. */
  quotaHourly?: number | null;
  quotaDaily?: number | null;
  quotaWeekly?: number | null;
  quotaMonthly?: number | null;
}

/** Valid job types for the automation API. */
export const VALID_JOB_TYPES = [
  "skill_execution",
  "media_generation",
  "agency_run",
  "batch_skill",
  "presentation_create",
  "video_project_create",
  "pipeline",
] as const;

export type JobType = (typeof VALID_JOB_TYPES)[number];

/** Maximum credits a single job can reserve (overflow guard). */
export const MAX_SINGLE_JOB_CREDITS = 10_000;

/** Standard API error codes. */
export type ApiErrorCode =
  | "invalid_api_key"
  | "key_suspended"
  | "insufficient_scopes"
  | "rate_limit_exceeded"
  | "insufficient_credits"
  | "daily_credit_limit_exceeded"
  | "quota_exceeded"
  | "invalid_request"
  | "not_found"
  | "internal_error"
  | "feature_disabled";

/** OpenAI-compatible error envelope. */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    type: string; // e.g. "auth_error", "billing_error", "invalid_request_error"
  };
}
