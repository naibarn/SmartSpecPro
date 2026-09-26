export type RuntimeEnvironment = "preview" | "staging" | "production";
export type HostBindingState =
  | "REQUESTED"
  | "VALIDATING"
  | "OWNERSHIP_VERIFICATION_PENDING"
  | "VERIFIED"
  | "CERTIFICATE_PENDING"
  | "ROUTING_PENDING"
  | "ACTIVE"
  | "VERIFICATION_FAILED"
  | "CERTIFICATE_FAILED"
  | "ROUTING_FAILED"
  | "SUSPENDED"
  | "DETACHED";

export type RuntimeNamespace = {
  contractVersion: "spec-219-v1";
  environment: RuntimeEnvironment;
  namespaceRef: string;
  isolation: "tenant-product";
};

export type RuntimeRelease = {
  contractVersion: "spec-219-v1";
  runtimeReleaseId: string;
  releaseCandidateId: string;
  tenantId: string;
  productId: string;
  environment: "staging" | "production";
  namespaceRef: string;
  artifactDigest: string;
  state: "STAGED" | "ACTIVE" | "ROLLED_BACK" | "SUSPENDED";
};

export type HostBinding = {
  contractVersion: "spec-219-v1";
  hostBindingId: string;
  hostname: string;
  tenantId: string;
  productId: string;
  environment: "staging" | "production";
  type: "PLATFORM_SUBDOMAIN" | "CUSTOM_DOMAIN";
  state: HostBindingState;
  canonical: boolean;
};

export class ManagedRuntimeDeploymentError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "ManagedRuntimeDeploymentError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const TENANT_ID = /^tenant-[A-Za-z0-9_-]{1,35}$/;
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_.:/-]{1,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ManagedRuntimeDeploymentError(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const result = text(value, code);
  if (!ID.test(result)) throw new ManagedRuntimeDeploymentError(code);
  return result;
}

function ref(value: unknown, code: string): string {
  const result = text(value, code);
  if (!REF.test(result)) throw new ManagedRuntimeDeploymentError(code);
  return result;
}

function tenantId(value: unknown): string {
  const result = text(value, "TENANT_ID_INVALID");
  if (!TENANT_ID.test(result)) throw new ManagedRuntimeDeploymentError("TENANT_ID_INVALID");
  return result;
}

function digest(value: unknown, code: string): string {
  const result = text(value, code);
  if (!DIGEST.test(result)) throw new ManagedRuntimeDeploymentError(code);
  return result;
}

export function buildRuntimeNamespace(input: { environment: RuntimeEnvironment; namespaceRef: string }): RuntimeNamespace {
  const namespaceRef = ref(input.namespaceRef, "NAMESPACE_REF_INVALID");
  if (namespaceRef !== `namespace:${input.environment}`) throw new ManagedRuntimeDeploymentError("NAMESPACE_SCOPE_INVALID");
  return { contractVersion: "spec-219-v1", environment: input.environment, namespaceRef, isolation: "tenant-product" };
}

export function buildRuntimeRelease(input: {
  candidate: {
    releaseCandidateId: string;
    tenantId: string;
    productId: string;
    artifactDigest: string;
    contentHash: string;
    immutableVerified: true;
    evidenceComplete: true;
    handoffToSpec219: true;
    productionApproved?: true;
  };
  environment: "staging" | "production";
  namespaceRef: string;
  runtimeReleaseId: string;
}): RuntimeRelease {
  if (!input.candidate.evidenceComplete || !input.candidate.handoffToSpec219) throw new ManagedRuntimeDeploymentError("RC_NOT_ELIGIBLE");
  if (input.candidate.immutableVerified !== true) throw new ManagedRuntimeDeploymentError("RC_NOT_IMMUTABLE");
  digest(input.candidate.contentHash, "RC_CONTENT_HASH_INVALID");
  if (input.environment === "production" && input.candidate.productionApproved !== true) throw new ManagedRuntimeDeploymentError("PRODUCTION_PROMOTION_REQUIRED");
  buildRuntimeNamespace({ environment: input.environment, namespaceRef: input.namespaceRef });
  return {
    contractVersion: "spec-219-v1",
    runtimeReleaseId: id(input.runtimeReleaseId, "RUNTIME_RELEASE_ID_INVALID"),
    releaseCandidateId: id(input.candidate.releaseCandidateId, "RC_ID_INVALID"),
    tenantId: tenantId(input.candidate.tenantId),
    productId: id(input.candidate.productId, "PRODUCT_ID_INVALID"),
    environment: input.environment,
    namespaceRef: input.namespaceRef,
    artifactDigest: digest(input.candidate.artifactDigest, "ARTIFACT_DIGEST_INVALID"),
    state: "STAGED",
  };
}

export function buildHostBinding(input: {
  hostBindingId: string;
  hostname: string;
  tenantId: string;
  productId: string;
  environment: "staging" | "production";
  type: "PLATFORM_SUBDOMAIN" | "CUSTOM_DOMAIN";
}): HostBinding {
  const hostname = text(input.hostname, "HOSTNAME_INVALID").toLowerCase();
  if (!HOSTNAME.test(hostname)) throw new ManagedRuntimeDeploymentError("HOSTNAME_INVALID");
  return {
    contractVersion: "spec-219-v1",
    hostBindingId: id(input.hostBindingId, "HOST_BINDING_ID_INVALID"),
    hostname,
    tenantId: tenantId(input.tenantId),
    productId: id(input.productId, "PRODUCT_ID_INVALID"),
    environment: input.environment,
    type: input.type,
    state: input.type === "PLATFORM_SUBDOMAIN" ? "ACTIVE" : "REQUESTED",
    canonical: input.type === "PLATFORM_SUBDOMAIN",
  };
}

const HOST_NEXT: Record<HostBindingState, HostBindingState[]> = {
  REQUESTED: ["VALIDATING", "DETACHED"],
  VALIDATING: ["OWNERSHIP_VERIFICATION_PENDING", "VERIFICATION_FAILED"],
  OWNERSHIP_VERIFICATION_PENDING: ["VERIFIED", "VERIFICATION_FAILED"],
  VERIFIED: ["CERTIFICATE_PENDING", "DETACHED"],
  CERTIFICATE_PENDING: ["ROUTING_PENDING", "CERTIFICATE_FAILED"],
  ROUTING_PENDING: ["ACTIVE", "ROUTING_FAILED"],
  ACTIVE: ["SUSPENDED", "DETACHED"],
  VERIFICATION_FAILED: ["VALIDATING", "DETACHED"],
  CERTIFICATE_FAILED: ["CERTIFICATE_PENDING", "DETACHED"],
  ROUTING_FAILED: ["ROUTING_PENDING", "DETACHED"],
  SUSPENDED: ["ACTIVE", "DETACHED"],
  DETACHED: [],
};

export function advanceHostBinding(binding: HostBinding, nextState: HostBindingState): HostBinding {
  if (!HOST_NEXT[binding.state].includes(nextState)) throw new ManagedRuntimeDeploymentError("HOST_TRANSITION_INVALID");
  return { ...binding, state: nextState };
}

export function promoteRuntimeRelease(input: {
  release: RuntimeRelease;
  targetEnvironment: "production";
  healthCheckPassed: boolean;
  policyCheckPassed: boolean;
}): RuntimeRelease {
  if (input.release.environment !== "staging" || input.release.state !== "STAGED") throw new ManagedRuntimeDeploymentError("PROMOTION_SOURCE_INVALID");
  if (!input.healthCheckPassed || !input.policyCheckPassed) throw new ManagedRuntimeDeploymentError("PROMOTION_CHECK_FAILED");
  return { ...input.release, environment: "production", namespaceRef: "namespace:production", state: "ACTIVE" };
}

export function rollbackRuntimeRelease(input: {
  current: RuntimeRelease;
  targetReleaseId: string;
  targetArtifactDigest: string;
  targetKnownGood: boolean;
  dataBackwardCompatible: boolean;
}): RuntimeRelease & { rollbackFrom: string; state: "ROLLED_BACK" } {
  if (!input.targetKnownGood) throw new ManagedRuntimeDeploymentError("ROLLBACK_TARGET_INVALID");
  if (!input.dataBackwardCompatible) throw new ManagedRuntimeDeploymentError("ROLLBACK_DATA_INCOMPATIBLE");
  return {
    ...input.current,
    runtimeReleaseId: id(input.targetReleaseId, "RUNTIME_RELEASE_ID_INVALID"),
    artifactDigest: digest(input.targetArtifactDigest, "ARTIFACT_DIGEST_INVALID"),
    state: "ROLLED_BACK",
    rollbackFrom: input.current.runtimeReleaseId,
  };
}

export function suspendRuntime(input: { release: RuntimeRelease; target: "RELEASE" | "PRODUCT" | "TENANT" | "CUSTOM_DOMAIN"; reason: string }): RuntimeRelease & { suspensionTarget: typeof input.target; suspensionReason: string } {
  return { ...input.release, state: "SUSPENDED", suspensionTarget: input.target, suspensionReason: text(input.reason, "SUSPENSION_REASON_REQUIRED") };
}
