/**
 * Static activation checks for the bounded Cloudflare Staging job profile.
 * These run before the Admin route creates any owner policy, grant, or job.
 */
export type CloudflareStagingActivationProfile = {
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

export function cloudflareStagingActivationBlocker(
  profile: CloudflareStagingActivationProfile | null | undefined,
): CloudflareStagingActivationBlocker | null {
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
