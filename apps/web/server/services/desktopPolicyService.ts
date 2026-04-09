import path from "node:path";

import {
  desktopCapabilityManifestSchema,
  desktopHostPolicySnapshotSchema,
  desktopLocalRootSchema,
  desktopRolloutGateStateSchema,
  desktopWorkspaceProfileSchema,
  type DesktopApprovalRule,
  type DesktopDerivedStorePolicy,
  type DesktopHostPolicySnapshot,
  type DesktopLocalRoot,
  type DesktopRolloutGateState,
  type DesktopWorkspaceProfile,
} from "../../shared/desktopHost";
import {
  buildDesktopHostPolicySnapshot as buildBaseDesktopHostPolicySnapshot,
  DESKTOP_HOST_POLICY_FEATURE_FLAGS,
  resolveDesktopHostFeatureFlags,
  validateDesktopDeviceRegistrationPayload,
  type BuildDesktopHostPolicySnapshotInput,
} from "./deviceRegistryService";

const SENSITIVE_ROOT_PATTERNS = [
  /^\/$/,
  /^\/etc(?:\/|$)/,
  /^\/bin(?:\/|$)/,
  /^\/sbin(?:\/|$)/,
  /^\/usr(?:\/|$)/,
  /^\/var(?:\/|$)/,
  /^\/private(?:\/|$)/,
  /^\/System(?:\/|$)/,
  /^\/Windows(?:\/|$)/i,
  /^\/Program Files(?:\/|$)/i,
  /^\/Users\/[^/]+\/Library\/Application Support(?:\/|$)/,
  /^\/Users\/[^/]+\/Library\/Keychains(?:\/|$)/,
  /^\/Users\/[^/]+\/\.ssh(?:\/|$)/,
  /^\/Users\/[^/]+\/\.config(?:\/|$)/,
  /^\/home\/[^/]+\/\.ssh(?:\/|$)/,
  /^\/home\/[^/]+\/\.config(?:\/|$)/,
  /^[a-z]:\/windows(?:\/|$)/i,
  /^[a-z]:\/program files(?:\/|$)/i,
  /^[a-z]:\/users\/[^/]+\/appdata(?:\/|$)/i,
  /^[a-z]:\/users\/[^/]+\/\.ssh(?:\/|$)/i,
  /^[a-z]:\/users\/[^/]+\/\.config(?:\/|$)/i,
];

export interface BuildDesktopLocalRootPolicyInput {
  rootId: string;
  name: string;
  absolutePath: string;
  requestedWritebackMode?: DesktopLocalRoot["writebackMode"];
  advancedLocalMode?: boolean;
  indexingEnabled?: boolean;
  previewEnabled?: boolean;
  vectorIndexEnabled?: boolean;
}

export interface BuildDesktopWorkspaceProfileInput {
  profileName: DesktopWorkspaceProfile["profileName"];
  projectWorkspacePath: string;
  packageCachePath?: string | null;
  localRoots?: DesktopLocalRoot[];
  needsConnectorSidecar?: boolean;
  advancedLocalMode?: boolean;
}

export interface BuildManagedDesktopHostPolicySnapshotInput
  extends BuildDesktopHostPolicySnapshotInput {
  localRoots?: DesktopLocalRoot[];
  derivedStorePolicy?: Partial<DesktopDerivedStorePolicy>;
  workspaceProfiles?: DesktopWorkspaceProfile[];
  approvalRules?: DesktopApprovalRule[];
  rolloutGates?: DesktopRolloutGateState[];
}

export interface BuildDesktopOffboardingPlanInput {
  deviceId: string;
  cleanupOnNextContact?: boolean;
  packageCachePaths?: string[];
  localRoots?: DesktopLocalRoot[];
  derivedStorePolicy?: Partial<DesktopDerivedStorePolicy>;
}

export interface DesktopOffboardingPlan {
  deviceId: string;
  revokeTokensImmediately: true;
  blockNewRuns: true;
  invalidatePackageCache: boolean;
  purgeDerivedStores: boolean;
  cleanupOnNextContact: boolean;
  packageCachePaths: string[];
  localRootIds: string[];
}

export interface EvaluateDesktopOutboundPolicyInput {
  destinationClass: "connector" | "server" | "gateway" | "public_web";
  dataSensitivity: "low" | "moderate" | "high";
  trustTaintedOutput: boolean;
}

function normalizeDesktopPath(rawPath: string): string {
  const replaced = rawPath.replace(/\\/g, "/").trim();
  const isWindowsAbsolutePath = /^[a-zA-Z]:\//.test(replaced);
  const normalized = path.posix.normalize(replaced);
  if (isWindowsAbsolutePath) {
    return normalized;
  }
  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }
  return normalized;
}

export function isSensitiveDesktopRootPath(rawPath: string): boolean {
  const normalized = normalizeDesktopPath(rawPath);
  return SENSITIVE_ROOT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildDesktopLocalRootPolicy(
  input: BuildDesktopLocalRootPolicyInput,
): DesktopLocalRoot {
  const deniedByDefault = isSensitiveDesktopRootPath(input.absolutePath);
  const advancedLocalMode = input.advancedLocalMode === true;

  return desktopLocalRootSchema.parse({
    rootId: input.rootId,
    name: input.name,
    absolutePath: normalizeDesktopPath(input.absolutePath),
    writebackMode: deniedByDefault
      ? "read_search_only"
      : input.requestedWritebackMode
        ?? (advancedLocalMode ? "user_confirmed_root_write" : "managed_output_only"),
    indexingEnabled: input.indexingEnabled ?? !deniedByDefault,
    previewEnabled: input.previewEnabled ?? !deniedByDefault,
    vectorIndexEnabled: input.vectorIndexEnabled ?? false,
    deniedByDefault,
    denialReason: deniedByDefault
      ? "sensitive_root_blocked_by_default"
      : null,
  });
}

export function buildDesktopWorkspaceProfile(
  input: BuildDesktopWorkspaceProfileInput,
): DesktopWorkspaceProfile {
  const advancedLocalMode = input.advancedLocalMode === true;
  const localRoots = input.localRoots ?? [];
  const rootMounts = localRoots
    .filter((root) => !root.deniedByDefault)
    .map((root) => ({
      mountType: "local_root" as const,
      sourcePath: root.absolutePath,
      targetPath: `/roots/${root.rootId}`,
      readOnly:
        !advancedLocalMode
        && root.writebackMode !== "user_confirmed_root_write"
        && root.writebackMode !== "advanced_local_override",
    }));

  const mounts = [
    {
      mountType: "project_workspace" as const,
      sourcePath: normalizeDesktopPath(input.projectWorkspacePath),
      targetPath: "/workspace",
      readOnly: false,
    },
    ...rootMounts,
    ...(input.packageCachePath
      ? [{
          mountType: "package_cache" as const,
          sourcePath: normalizeDesktopPath(input.packageCachePath),
          targetPath: "/packages",
          readOnly: true,
        }]
      : []),
  ];

  const profile = desktopWorkspaceProfileSchema.parse({
    profileName: input.profileName,
    networkClass: advancedLocalMode
      ? "approved_public_web"
      : input.needsConnectorSidecar
        ? "approved_connectors_only"
        : "gateway_only",
    cpuLimit: advancedLocalMode ? 8 : 4,
    memoryMb: advancedLocalMode ? 8192 : 4096,
    mounts,
    connectorSidecarAllowed: input.needsConnectorSidecar ?? false,
    writebackMode: advancedLocalMode ? "advanced_local_override" : "managed_output_only",
  });

  return profile;
}

export function buildDefaultDesktopApprovalRules(
  advancedLocalMode = false,
): DesktopApprovalRule[] {
  return [
    {
      action: "delete_file",
      decision: "confirm",
      rationale: "Destructive local deletion always requires a user-visible confirmation.",
    },
    {
      action: "overwrite_root_file",
      decision: advancedLocalMode ? "confirm" : "deny",
      rationale: advancedLocalMode
        ? "Advanced local mode still requires explicit overwrite confirmation."
        : "Managed mode writes only into controlled output folders.",
    },
    {
      action: "outbound_connector_message",
      decision: "confirm",
      rationale: "Connector egress is a DLP-sensitive action.",
    },
    {
      action: "shell_exec",
      decision: advancedLocalMode ? "confirm" : "deny",
      rationale: advancedLocalMode
        ? "Shell execution is allowed only with explicit user step-up."
        : "Managed mode denies raw shell execution by default.",
    },
    {
      action: "privileged_mount",
      decision: advancedLocalMode ? "confirm" : "deny",
      rationale: "Mount expansion is not silent in managed mode.",
    },
    {
      action: "unrestricted_network",
      decision: advancedLocalMode ? "confirm" : "deny",
      rationale: "Network class expansion requires explicit approval.",
    },
    {
      action: "install_local_unverified_package",
      decision: advancedLocalMode ? "confirm" : "deny",
      rationale: "Local-unverified packages require explicit trust step-up.",
    },
    {
      action: "publish_trust_tainted_output",
      decision: "deny",
      rationale: "Trust-tainted outputs cannot silently promote into verified org surfaces.",
    },
  ];
}

export function buildDesktopRolloutGateStates(input: {
  deviceBindingReady: boolean;
  signedPackagesEnforced: boolean;
  signedUpdatesEnforced: boolean;
  managedFileRootsDefault: boolean;
  piGatewayOnly: boolean;
  agencyGatewayOnly: boolean;
  offboardingCleanupReady: boolean;
}): DesktopRolloutGateState[] {
  return [
    {
      gate: "device_binding_ready",
      satisfied: input.deviceBindingReady,
      reason: input.deviceBindingReady
        ? "proof_of_possession_device_binding_live"
        : "device_binding_not_live",
    },
    {
      gate: "signed_packages_enforced",
      satisfied: input.signedPackagesEnforced,
      reason: input.signedPackagesEnforced
        ? "signed_package_verification_required"
        : "signed_package_verification_bypassable",
    },
    {
      gate: "signed_updates_enforced",
      satisfied: input.signedUpdatesEnforced,
      reason: input.signedUpdatesEnforced
        ? "signed_update_verification_required"
        : "signed_update_verification_bypassable",
    },
    {
      gate: "managed_file_roots_default",
      satisfied: input.managedFileRootsDefault,
      reason: input.managedFileRootsDefault
        ? "managed_file_roots_are_default"
        : "raw_path_discovery_still_default",
    },
    {
      gate: "pi_gateway_only",
      satisfied: input.piGatewayOnly,
      reason: input.piGatewayOnly
        ? "pi_gateway_injection_enforced"
        : "pi_can_start_with_unmanaged_keys",
    },
    {
      gate: "agency_gateway_only",
      satisfied: input.agencyGatewayOnly,
      reason: input.agencyGatewayOnly
        ? "agency_gateway_injection_enforced"
        : "agency_can_start_with_unmanaged_keys",
    },
    {
      gate: "offboarding_cleanup_ready",
      satisfied: input.offboardingCleanupReady,
      reason: input.offboardingCleanupReady
        ? "offboarding_cleanup_and_purge_live"
        : "offboarding_cleanup_incomplete",
    },
  ].map((gate) => desktopRolloutGateStateSchema.parse(gate));
}

export function buildManagedDesktopHostPolicySnapshot(
  input: BuildManagedDesktopHostPolicySnapshotInput,
): DesktopHostPolicySnapshot {
  const base = buildBaseDesktopHostPolicySnapshot(input);
  return desktopHostPolicySnapshotSchema.parse({
    ...base,
    localRoots: input.localRoots ?? [],
    derivedStorePolicy: input.derivedStorePolicy ?? {},
    workspaceProfiles: input.workspaceProfiles ?? [],
    approvalRules: input.approvalRules ?? buildDefaultDesktopApprovalRules(
      input.featureFlags?.desktopAdvancedLocalMode === true,
    ),
    rolloutGates: input.rolloutGates ?? [],
  });
}

export function buildDesktopOffboardingPlan(
  input: BuildDesktopOffboardingPlanInput,
): DesktopOffboardingPlan {
  const derivedStorePolicy = input.derivedStorePolicy ?? {};
  return {
    deviceId: input.deviceId,
    revokeTokensImmediately: true,
    blockNewRuns: true,
    invalidatePackageCache: true,
    purgeDerivedStores:
      derivedStorePolicy.purgeOnOffboarding !== false,
    cleanupOnNextContact: input.cleanupOnNextContact !== false,
    packageCachePaths: [...(input.packageCachePaths ?? [])],
    localRootIds: (input.localRoots ?? []).map((root) => root.rootId),
  };
}

export function enforceDesktopCapabilityManifest(input: {
  capabilityManifest: unknown;
  requiredCapability: string;
}): void {
  const manifest = desktopCapabilityManifestSchema.parse(input.capabilityManifest);
  if (!manifest.capabilities.includes(input.requiredCapability)) {
    throw new Error(`required desktop capability missing: ${input.requiredCapability}`);
  }
}

export function evaluateDesktopOutboundPolicy(
  input: EvaluateDesktopOutboundPolicyInput,
): "allow" | "confirm" | "deny" {
  if (input.trustTaintedOutput) {
    return "deny";
  }
  if (input.destinationClass === "connector" && input.dataSensitivity !== "low") {
    return "confirm";
  }
  if (input.destinationClass === "public_web" && input.dataSensitivity === "high") {
    return "confirm";
  }
  return "allow";
}

export {
  buildBaseDesktopHostPolicySnapshot as buildDesktopHostPolicySnapshot,
  DESKTOP_HOST_POLICY_FEATURE_FLAGS,
  resolveDesktopHostFeatureFlags,
  validateDesktopDeviceRegistrationPayload,
};

export type { BuildDesktopHostPolicySnapshotInput };
