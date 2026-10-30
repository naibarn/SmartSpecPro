/**
 * Static activation checks for the bounded Cloudflare Staging job profile.
 * These run before the Admin route creates any owner policy, grant, or job.
 */
export type CloudflareStagingActivationProfile = {
  applicationHttp?: { traffic?: string };
  applicationSecretsConfigured?: boolean;
  workflowExecution?: string;
  jobTransport?: string;
  nativeResources?: { privateDatabase?: unknown };
  workflowRuntimeTokenConfigured?: boolean;
  controlPlaneTokenConfigured?: boolean;
};

export type CloudflareStagingActivationBlocker =
  | "STAGING_ACTIVATION_PROFILE_REQUIRED"
  | "STAGING_QUEUE_TRANSPORT_REQUIRED"
  | "STAGING_PRIVATE_DATABASE_BINDING_REQUIRED"
  | "STAGING_WORKFLOW_RUNTIME_SECRETS_REQUIRED";

export type CloudflareStagingOriginConfigurationBlocker =
  | "STAGING_ORIGIN_CONFIGURATION_UNAVAILABLE"
  | "STAGING_PRIVATE_DATABASE_RECEIPT_INVALID"
  | "STAGING_NATIVE_RESOURCE_RECEIPT_INVALID";

/** Convert verified server-side receipt failures into safe, actionable preflight codes. */
export function cloudflareStagingOriginConfigurationBlocker(error: unknown): CloudflareStagingOriginConfigurationBlocker {
  const diagnosticCode = error && typeof error === "object" && "diagnosticCode" in error
    ? (error as { diagnosticCode?: unknown }).diagnosticCode
    : null;
  if (diagnosticCode === "PRIVATE_DATABASE_PROVISION_RECEIPT_DENIED") return "STAGING_PRIVATE_DATABASE_RECEIPT_INVALID";
  if (diagnosticCode === "CLOUDFLARE_NATIVE_PROVISION_RECEIPT_DENIED") return "STAGING_NATIVE_RESOURCE_RECEIPT_INVALID";
  return "STAGING_ORIGIN_CONFIGURATION_UNAVAILABLE";
}

export function cloudflareStagingActivationBlocker(
  profile: CloudflareStagingActivationProfile | null | undefined,
): CloudflareStagingActivationBlocker | null {
  // M2 HTTP ingress uses its own verified images, secrets, and runtime path;
  // it must not inherit M3 Queue/private-DB lease requirements.
  if (profile?.applicationHttp?.traffic === "staging-full-http-v1" && profile.applicationSecretsConfigured === true) return null;
  if (profile?.workflowExecution !== "emergency-intake") {
    return "STAGING_ACTIVATION_PROFILE_REQUIRED";
  }
  if (profile.jobTransport !== "queues") {
    return "STAGING_QUEUE_TRANSPORT_REQUIRED";
  }
  if (!profile.nativeResources?.privateDatabase) {
    return "STAGING_PRIVATE_DATABASE_BINDING_REQUIRED";
  }
  if (profile.workflowRuntimeTokenConfigured === false || profile.controlPlaneTokenConfigured === false) {
    return "STAGING_WORKFLOW_RUNTIME_SECRETS_REQUIRED";
  }
  return null;
}
