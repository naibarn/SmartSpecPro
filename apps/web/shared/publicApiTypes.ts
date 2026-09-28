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
  "hermes:connect",
  "hermes:read",
  "hermes:write",
  "hermes:disconnect",
  "hermes:generate",
  "remotion:submit",
  "remotion:read",
  "remotion:cancel",
  "library:search",
  "library:read",
  "library:download",
  "library:upload",
  "media:read",
  "media:download",
  "jobs:create",
  "jobs:read",
  "webhooks:manage",
  "events:read",
  "api_keys:manage",
] as const;

export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];

/** Set version for fast O(1) lookups. */
export const ALLOWED_API_SCOPES_SET: ReadonlySet<string> = new Set(
  ALLOWED_API_SCOPES
);

/**
 * Browserless MCP clients (Hermes CLI, Claude Code CLI, and Codex CLI) use a
 * dedicated bearer key when OAuth cannot open a browser. Keep the default
 * capability set broad enough for the documented MCP experience, while still
 * allowing users to reduce it before creating the key.
 */
export const MCP_CLI_DEFAULT_SCOPES = [
  "mcp:read",
  "mcp:write",
  "llm:chat",
  "media:read",
  "media:generate",
  "media:download",
  "remotion:submit",
  "remotion:read",
  "remotion:cancel",
  "library:search",
  "library:read",
  "library:download",
  "hermes:connect",
  "hermes:read",
  "hermes:generate",
  "hermes:disconnect",
] as const satisfies readonly ApiScope[];

/** Conservative server-side defaults for a newly-created MCP CLI key. */
export const MCP_CLI_DEFAULT_CREDIT_QUOTAS = {
  fiveHour: 500,
  daily: 1_500,
  weekly: 5_000,
} as const;

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
  /** Dedicated headless MCP key marker, omitted for legacy/public API keys. */
  keyPurpose?: "public_api" | "mcp_cli";
  /** Credit budgets for dedicated MCP CLI keys; null means unlimited. */
  creditQuota5h?: number | null;
  creditQuotaDaily?: number | null;
  creditQuotaWeekly?: number | null;
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
  | "idempotency_conflict"
  | "not_found"
  | "internal_error"
  | "feature_disabled"
  | "credit_overflow"
  | "invalid_job_type"
  | "job_not_cancellable"
  | "circular_pipeline_reference"
  | "max_template_depth_exceeded";

/** OpenAI-compatible error envelope. */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    type: string; // e.g. "auth_error", "billing_error", "invalid_request_error"
  };
}
