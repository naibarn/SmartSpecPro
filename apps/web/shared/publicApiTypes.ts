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
  "webhooks:manage",
  "events:read",
  "api_keys:manage",
] as const;

export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];

/** Authentication context populated by API key middleware. */
export interface AuthContext {
  userId: number;
  tenantId: string; // varchar(36) -- NOT integer
  mode: "session" | "api_key";
  apiKeyId?: string;
  scopes?: string[];
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
