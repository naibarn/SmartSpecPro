import type { RetryPolicy } from "./jobControlPlaneTypes";

/** Stable Staging job identity shared without importing the runtime executor. */
export const CLOUDFLARE_STAGING_DEPLOYMENT_JOB = "cloudflare.staging.deploy" as const;
export const CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT = "cloudflare-staging-deploy-v1" as const;
export const CLOUDFLARE_STAGING_TARGET_ID = "smartspec-cloudflare-staging" as const;
export const CLOUDFLARE_STAGING_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 2_000,
  maxDelayMs: 5_000,
  jitter: "bounded",
  deadlineMs: 15 * 60_000,
  allowedErrorClasses: ["retryable"],
};
