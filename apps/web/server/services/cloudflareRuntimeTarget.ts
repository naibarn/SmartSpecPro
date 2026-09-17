/**
 * Feature 186 production runtime target.
 *
 * Google Cloud Tasks/Cloud Run was an earlier deployment shape. Canonical jobs
 * are published through the PostgreSQL outbox. PostgreSQL-pull is the current
 * local/Node-worker transport, while Cloudflare is an explicit migration
 * target selected only after its target-account readiness gates pass.
 */

export const CLOUDFLARE_RUNTIME_TARGET = "cloudflare" as const;
export const CLOUDFLARE_HARD_CUTOVER_FLAG =
  "FEATURE_186_CLOUDFLARE_HARD_CUTOVER" as const;
export const POSTGRES_PULL_HARNESS_FLAG =
  "FEATURE_186_POSTGRES_PULL_HARNESS" as const;
export const FEATURE_186_HARD_CUTOVER_FLAG =
  "FEATURE_186_HARD_CUTOVER" as const;

export type Feature186RuntimeReadiness = {
  target: typeof CLOUDFLARE_RUNTIME_TARGET;
  hardCutover: boolean;
  mode:
    | "disabled"
    | "postgres-pull"
    | "cloudflare"
    | "postgres-pull-harness"
    | "misconfigured";
  ready: boolean;
  reason?:
    | "hard_cutover_disabled"
    | "cloudflare_url_missing"
    | "cloudflare_token_missing"
    | "postgres_pull_harness_forbidden";
};

/**
 * Feature 186 hard cutover enables the canonical worker_jobs/outbox contract.
 * It does not select a remote transport. This lets the existing Node worker
 * run the same canonical envelope while Cloudflare migration is in progress.
 */
export function isFeature186HardCutoverEnabled(): boolean {
  return process.env[FEATURE_186_HARD_CUTOVER_FLAG] === "true";
}

/**
 * Cloudflare transport activation is an explicit, reversible migration step.
 * Missing URL/token therefore means local PostgreSQL-pull mode, not startup
 * failure, unless this flag has deliberately been enabled.
 */
export function isCloudflareHardCutoverEnabled(): boolean {
  return (
    isFeature186HardCutoverEnabled() &&
    process.env[CLOUDFLARE_HARD_CUTOVER_FLAG] === "true"
  );
}

/**
 * This flag is only for non-production harness labeling. Normal PostgreSQL-
 * pull is the supported local Node-worker runtime when canonical hard cutover
 * is enabled; the harness flag must never be used to bypass production gates.
 */
export function isPostgresPullHarnessEnabled(): boolean {
  return (
    process.env[POSTGRES_PULL_HARNESS_FLAG] === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export function feature186RuntimeReadiness(): Feature186RuntimeReadiness {
  const hardCutover = isFeature186HardCutoverEnabled();
  if (!hardCutover) {
    return {
      target: CLOUDFLARE_RUNTIME_TARGET,
      hardCutover,
      mode: "disabled",
      ready: true,
      reason: "hard_cutover_disabled",
    };
  }
  if (!isCloudflareHardCutoverEnabled()) {
    if (
      process.env[POSTGRES_PULL_HARNESS_FLAG] === "true" &&
      process.env.NODE_ENV === "production"
    ) {
      return {
        target: CLOUDFLARE_RUNTIME_TARGET,
        hardCutover,
        mode: "misconfigured",
        ready: false,
        reason: "postgres_pull_harness_forbidden",
      };
    }
    if (isPostgresPullHarnessEnabled()) {
      return {
        target: CLOUDFLARE_RUNTIME_TARGET,
        hardCutover,
        mode: "postgres-pull-harness",
        ready: true,
      };
    }
    return {
      target: CLOUDFLARE_RUNTIME_TARGET,
      hardCutover,
      mode: "postgres-pull",
      ready: true,
    };
  }
  const runtimeUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim();
  const runtimeToken = process.env.CLOUDFLARE_RUNTIME_TOKEN?.trim();
  if (runtimeUrl && runtimeToken) {
    return {
      target: CLOUDFLARE_RUNTIME_TARGET,
      hardCutover,
      mode: "cloudflare",
      ready: true,
    };
  }
  if (
    process.env[POSTGRES_PULL_HARNESS_FLAG] === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    return {
      target: CLOUDFLARE_RUNTIME_TARGET,
      hardCutover,
      mode: "misconfigured",
      ready: false,
      reason: "postgres_pull_harness_forbidden",
    };
  }
  if (isPostgresPullHarnessEnabled()) {
    return {
      target: CLOUDFLARE_RUNTIME_TARGET,
      hardCutover,
      mode: "postgres-pull-harness",
      ready: true,
    };
  }
  return {
    target: CLOUDFLARE_RUNTIME_TARGET,
    hardCutover,
    mode: "misconfigured",
    ready: false,
    reason: runtimeUrl ? "cloudflare_token_missing" : "cloudflare_url_missing",
  };
}

export function assertFeature186RuntimeConfigured(): void {
  const readiness = feature186RuntimeReadiness();
  if (!readiness.ready) throw new Error("CLOUDFLARE_RUNTIME_CONFIG_INCOMPLETE");
}

/**
 * Legacy Google runtime flags are deliberately fail-closed. Google OAuth and
 * Drive product integrations are intentionally not included here: a Google
 * OAuth project can legitimately retain project metadata while the job
 * runtime is Cloudflare-only.
 */
export function assertGoogleRuntimeDisabled(): void {
  const legacyRuntimeEnabled = [
    process.env.USE_CLOUD_TASKS,
    process.env.CLOUD_TASKS_SECRET,
    process.env.CLOUD_RUN_NODE_URL,
    process.env.CLOUD_RUN_PYTHON_URL,
    process.env.CLOUD_RUN_SA_EMAIL,
  ].some(
    value =>
      value === "true" || (typeof value === "string" && value.trim().length > 0)
  );

  if (legacyRuntimeEnabled) {
    throw new Error("GOOGLE_CLOUD_RUNTIME_RETIRED");
  }
}

export function cloudflareRuntimeStatus() {
  const readiness = feature186RuntimeReadiness();
  return {
    target: CLOUDFLARE_RUNTIME_TARGET,
    hardCutover: readiness.hardCutover,
    activation: isCloudflareHardCutoverEnabled() ? "enabled" : "disabled",
    googleRuntime: "retired" as const,
    googleOauthAndDrive: "product-integrations-only" as const,
    runtimeMode: readiness.mode,
    runtimeReady: readiness.ready,
    runtimeReason: readiness.reason ?? null,
  };
}
