/**
 * Server-only deployment capability projection.
 *
 * Callers must supply validated configuration and binding facts. Request
 * metadata is deliberately accepted only as opaque data and never participates
 * in mode selection; hostnames and user agents are browser-controlled inputs.
 */
export type PlatformIngressMode = "linux-platform" | "cloudflare-ingress";

export type CanonicalPlatformFacts = {
  linuxServiceValidated: boolean;
  databaseValidated: boolean;
  authValidated: boolean;
  auditValidated: boolean;
  workerJobsOutboxValidated: boolean;
};

export type CloudflareIngressFacts = {
  workerBindingValidated: boolean;
  privateOriginValidated: boolean;
  edgeAttestationValidated: boolean;
} & Record<string, unknown>;

export type PlatformRuntimeCapabilityInput = {
  configuredIngressMode?: PlatformIngressMode;
  canonicalPlatform?: CanonicalPlatformFacts;
  cloudflareIngress?: CloudflareIngressFacts;
  /** Untrusted request data may be passed by callers, but is intentionally ignored. */
  requestMetadata?: unknown;
};

export type PlatformRuntimeCapabilities = {
  status: "available";
  ingressMode: PlatformIngressMode;
  canonicalControlPlane: {
    owner: "linux-platform";
    database: true;
    authentication: true;
    audit: true;
    workerJobsOutbox: true;
  };
  capabilities: {
    directLinuxIngress: boolean;
    cloudflareIngress: boolean;
    cloudflareIsTransportOnly: boolean;
  };
};

export type PlatformRuntimeUnavailable = {
  status: "unavailable";
  reason: "MISSING_CONFIGURATION" | "CONFLICTING_CONFIGURATION" | "INVALID_CONFIGURATION";
};

export type PlatformRuntimeCapabilityResolution = PlatformRuntimeCapabilities | PlatformRuntimeUnavailable;

function canonicalPlatformIsValidated(facts: CanonicalPlatformFacts | undefined): facts is CanonicalPlatformFacts {
  return facts?.linuxServiceValidated === true
    && facts.databaseValidated === true
    && facts.authValidated === true
    && facts.auditValidated === true
    && facts.workerJobsOutboxValidated === true;
}

function cloudflareIngressIsValidated(facts: CloudflareIngressFacts | undefined): facts is CloudflareIngressFacts {
  return facts?.workerBindingValidated === true
    && facts.privateOriginValidated === true
    && facts.edgeAttestationValidated === true;
}

function available(ingressMode: PlatformIngressMode): PlatformRuntimeCapabilities {
  return {
    status: "available",
    ingressMode,
    canonicalControlPlane: {
      owner: "linux-platform",
      database: true,
      authentication: true,
      audit: true,
      workerJobsOutbox: true,
    },
    capabilities: {
      directLinuxIngress: ingressMode === "linux-platform",
      cloudflareIngress: ingressMode === "cloudflare-ingress",
      cloudflareIsTransportOnly: ingressMode === "cloudflare-ingress",
    },
  };
}

/**
 * Resolves only explicit, trusted deployment facts into the safe public
 * capability projection. It does not inspect process environment, Host,
 * Origin, or user-agent, and it never copies input binding values to output.
 */
export function resolvePlatformRuntimeCapabilities(
  input: PlatformRuntimeCapabilityInput,
): PlatformRuntimeCapabilityResolution {
  if (!input || typeof input !== "object") {
    return { status: "unavailable", reason: "INVALID_CONFIGURATION" };
  }

  if (input.configuredIngressMode !== "linux-platform" && input.configuredIngressMode !== "cloudflare-ingress") {
    return { status: "unavailable", reason: "MISSING_CONFIGURATION" };
  }

  if (!canonicalPlatformIsValidated(input.canonicalPlatform)) {
    return { status: "unavailable", reason: "MISSING_CONFIGURATION" };
  }

  if (input.configuredIngressMode === "linux-platform") {
    if (input.cloudflareIngress !== undefined) {
      return { status: "unavailable", reason: "CONFLICTING_CONFIGURATION" };
    }
    return available("linux-platform");
  }

  if (!input.cloudflareIngress) {
    return { status: "unavailable", reason: "MISSING_CONFIGURATION" };
  }

  if (!cloudflareIngressIsValidated(input.cloudflareIngress)) {
    return { status: "unavailable", reason: "MISSING_CONFIGURATION" };
  }

  return available("cloudflare-ingress");
}
