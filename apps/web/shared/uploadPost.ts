export const UPLOAD_POST_POLICY_VERSION = "2026-03-24";

export const UPLOAD_POST_PLATFORMS = [
  "facebook",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "linkedin",
  "x",
  "pinterest",
  "other",
] as const;

export type UploadPostPlatform = (typeof UPLOAD_POST_PLATFORMS)[number];

export const UPLOAD_POST_CONNECTION_STATUSES = [
  "pending",
  "active",
  "disconnected",
  "error",
] as const;

export type UploadPostConnectionStatus = (typeof UPLOAD_POST_CONNECTION_STATUSES)[number];

export const UPLOAD_POST_PROFILE_STATUSES = [
  "active",
  "disabled",
  "draft",
] as const;

export type UploadPostProfileStatus = (typeof UPLOAD_POST_PROFILE_STATUSES)[number];

export const UPLOAD_POST_JOB_STATUSES = [
  "queued",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "stale",
] as const;

export type UploadPostJobStatus = (typeof UPLOAD_POST_JOB_STATUSES)[number];

export const UPLOAD_POST_HEALTH_STATUSES = [
  "unknown",
  "healthy",
  "degraded",
  "unhealthy",
] as const;

export type UploadPostHealthStatus = (typeof UPLOAD_POST_HEALTH_STATUSES)[number];

export interface UploadPostConsentState {
  accepted: boolean;
  acceptedAt: string | null;
  policyVersion: string | null;
}

export type UploadPostQueueSettings = Record<string, unknown> & {
  enabled: boolean;
  maxPendingJobs: number;
  publishWindowMinutes: number;
  retryWindowMinutes: number;
};

export interface UploadPostQuotaState {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

export interface UploadPostConnectionSummary {
  id: number;
  tenantId: string;
  userId: number;
  status: UploadPostConnectionStatus;
  healthStatus: UploadPostHealthStatus;
  apiKeyHint: string | null;
  consent: UploadPostConsentState;
  connectedAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
}

export interface UploadPostConnectionDetail extends UploadPostConnectionSummary {
  lastHealthCheckAt: string | null;
  sharedKeyWarning: boolean;
  quota: UploadPostQuotaState;
  queueSettings: UploadPostQueueSettings;
  analytics: Record<string, unknown> | null;
  profiles: UploadPostProfileSummary[];
  jobs: UploadPostJobSummary[];
}

export interface UploadPostProfileSummary {
  id: number;
  connectionId: number;
  tenantId: string;
  userId: number;
  platform: UploadPostPlatform;
  platformPageId: string;
  displayName: string | null;
  status: UploadPostProfileStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadPostJobMetadata {
  gateway: "upload_post";
  profileId: number | null;
  platform: UploadPostPlatform;
  queueKey: string;
  source: "manual" | "workflow" | "agency";
  scheduledByUserId: number | null;
  externalJobId: string | null;
  platformResults: Record<string, unknown> | null;
  metadataClearedAt: string | null;
}

export interface UploadPostJobSummary {
  id: number;
  tenantId: string;
  userId: number;
  connectionId: number;
  profileId: number | null;
  platform: UploadPostPlatform;
  status: UploadPostJobStatus;
  contentText: string | null;
  contentLink: string | null;
  mediaRefs: string[] | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  providerJobId: string | null;
  errorMessage: string | null;
  metadata: UploadPostJobMetadata | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
